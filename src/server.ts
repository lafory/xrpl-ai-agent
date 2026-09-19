import path from 'path';
import express, { Request, Response } from 'express';
import { AgentExecutor } from 'langchain/agents';
import { loadConfig } from './config';
import { AgentContext, connectClient, walletFromSeed } from './xrpl/client';
import { buildAgent } from './agent';
import { placeDexOrder, placeDexOrderSchema } from './tools/xrplDex';
import { acceptNftOfferSchema, buyNft, createNftOffer, createNftOfferSchema } from './tools/xrplNft';

const PORT = Number(process.env.PORT ?? 3000);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handle(res: Response, action: () => Promise<unknown>): Promise<void> {
  try {
    res.json({ status: 'submitted', result: await action() });
  } catch (error) {
    res.status(400).json({ status: 'rejected', error: errorMessage(error) });
  }
}

export async function createServer(ctx: AgentContext, agent: AgentExecutor | null) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/wallet', async (_req: Request, res: Response) => {
    await handle(res, async () => {
      const [balance, offers, nfts] = await Promise.all([
        ctx.client.getXrpBalance(ctx.wallet.classicAddress),
        ctx.client.request({ command: 'account_offers', account: ctx.wallet.classicAddress, ledger_index: 'validated' }),
        ctx.client.request({ command: 'account_nfts', account: ctx.wallet.classicAddress, ledger_index: 'validated' }),
      ]);
      return {
        address: ctx.wallet.classicAddress,
        network: ctx.client.url,
        balanceXrp: balance,
        maxSpendXrp: ctx.maxSpendXrp,
        agentEnabled: agent !== null,
        offers: offers.result.offers ?? [],
        nfts: nfts.result.account_nfts ?? [],
      };
    });
  });

  app.post('/api/dex/order', async (req: Request, res: Response) => {
    await handle(res, () => placeDexOrder(ctx, placeDexOrderSchema.parse(req.body)));
  });

  app.post('/api/nft/offer', async (req: Request, res: Response) => {
    await handle(res, () => createNftOffer(ctx, createNftOfferSchema.parse(req.body)));
  });

  app.post('/api/nft/accept', async (req: Request, res: Response) => {
    await handle(res, () => buyNft(ctx, acceptNftOfferSchema.parse(req.body)));
  });

  app.post('/api/agent', async (req: Request, res: Response) => {
    await handle(res, async () => {
      if (!agent) {
        throw new Error('Agent disabled: set OPENAI_API_KEY to enable natural-language instructions.');
      }
      const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
      if (!input) throw new Error('An "input" instruction is required.');
      const result = await agent.invoke({ input });
      return { output: result.output };
    });
  });

  return app;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = await connectClient(config.rpcUrl);
  const wallet = walletFromSeed(config.seed);
  const ctx: AgentContext = { client, wallet, maxSpendXrp: config.maxSpendXrp };

  const agent = config.openAiApiKey
    ? await buildAgent(ctx, {
        apiKey: config.openAiApiKey,
        model: config.openAiModel,
        baseUrl: config.openAiBaseUrl,
        maxTokens: config.openAiMaxTokens,
      })
    : null;

  const app = await createServer(ctx, agent);
  app.listen(PORT, () => {
    console.log(`Dashboard on http://localhost:${PORT} (wallet ${wallet.classicAddress}, ${config.rpcUrl})`);
    if (!agent) console.log('Agent chat disabled: OPENAI_API_KEY is not set.');
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
