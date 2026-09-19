import { StructuredToolInterface, tool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { AgentContext } from './xrpl/client';
import { DEFAULT_MAX_SPEND_XRP, assertWithinSpendLimit } from './guardrails';
import { PlaceDexOrderInput, placeDexOrder, placeDexOrderSchema, spendXrpOf } from './tools/xrplDex';
import {
  AcceptNftOfferInput,
  CreateNftOfferInput,
  acceptNftOfferSchema,
  buyNft,
  createNftOffer,
  createNftOfferSchema,
} from './tools/xrplNft';
import { xrpValueOf } from './xrpl/amounts';

/** Hard cap on the XRP any single agent-initiated transaction may spend. */
export const MAX_SPEND_XRP = DEFAULT_MAX_SPEND_XRP;

export const SYSTEM_PROMPT = [
  'You are an autonomous trading agent for a self-sovereign XRP wallet on the XRPL **Testnet**.',
  'You can place orders on the native DEX and trade XLS-20 NFTs through the provided tools.',
  'You never see or need the wallet seed: signing happens outside of your context.',
  `Every transaction is capped at ${MAX_SPEND_XRP} XRP by a programmatic guardrail; do not attempt to bypass it.`,
  'Before trading, restate the amounts you are about to commit. If a tool returns an error, explain it plainly instead of retrying blindly.',
].join(' ');

export function buildTools(ctx: AgentContext): StructuredToolInterface[] {
  const placeDexOrderTool = tool(
    async (input: PlaceDexOrderInput) => {
      assertWithinSpendLimit(spendXrpOf(input.takerGets), ctx.maxSpendXrp, 'placeDexOrder');
      const result = await placeDexOrder(ctx, input);
      return JSON.stringify(result);
    },
    {
      name: 'placeDexOrder',
      description:
        'Create an OfferCreate transaction on the XRPL DEX, trading XRP for an issued token or vice versa. ' +
        'takerGets is what the wallet gives up, takerPays is what it receives.',
      schema: placeDexOrderSchema,
    },
  );

  const buyNftToolInstance = tool(
    async (input: AcceptNftOfferInput) => {
      const result = await buyNft(ctx, input);
      return JSON.stringify(result);
    },
    {
      name: 'buyNftTool',
      description:
        'Accept an existing XLS-20 NFT offer by its NFTokenOfferIndex (NFTokenAcceptOffer). ' +
        'Use side="sell" to buy an NFT listed for sale, side="buy" to accept a bid on an owned NFT.',
      schema: acceptNftOfferSchema,
    },
  );

  const createNftOfferToolInstance = tool(
    async (input: CreateNftOfferInput) => {
      if (input.side === 'buy') {
        assertWithinSpendLimit(xrpValueOf(input.amount), ctx.maxSpendXrp, 'createNftOffer(buy)');
      }
      const result = await createNftOffer(ctx, input);
      return JSON.stringify(result);
    },
    {
      name: 'createNftOffer',
      description: 'Create an XLS-20 NFT buy or sell offer (NFTokenCreateOffer) for a given NFTokenID.',
      schema: createNftOfferSchema,
    },
  );

  return [placeDexOrderTool, buyNftToolInstance, createNftOfferToolInstance];
}

export interface BuildAgentOptions {
  apiKey?: string;
  model?: string;
}

export async function buildAgent(ctx: AgentContext, options: BuildAgentOptions = {}): Promise<AgentExecutor> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to run the agent.');
  }

  const llm = new ChatOpenAI({
    apiKey,
    model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SYSTEM_PROMPT],
    ['system', `Wallet address: ${ctx.wallet.classicAddress}. Network: ${ctx.client.url}.`],
    ['placeholder', '{chat_history}'],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]);

  const tools = buildTools(ctx);
  const agent = await createToolCallingAgent({ llm, tools, prompt });
  return new AgentExecutor({ agent, tools });
}
