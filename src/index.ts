import { loadConfig } from './config';
import { AgentContext, connectClient, walletFromSeed } from './xrpl/client';
import { buildAgent } from './agent';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = await connectClient(config.rpcUrl);
  const wallet = walletFromSeed(config.seed);
  const ctx: AgentContext = { client, wallet, maxSpendXrp: config.maxSpendXrp };

  try {
    const balance = await client.getXrpBalance(wallet.classicAddress);
    console.log(`Connected to ${config.rpcUrl}`);
    console.log(`Wallet ${wallet.classicAddress} balance: ${balance} XRP`);
    console.log(`Spending guardrail: ${config.maxSpendXrp} XRP per transaction`);

    const instruction = process.argv.slice(2).join(' ').trim();
    if (!instruction) {
      console.log('\nNo instruction given. Example:');
      console.log('  npm run dev -- "Sell 1 XRP for 1 USD issued by rQ3...; use an immediate-or-cancel offer"');
      return;
    }

    const executor = await buildAgent(ctx, { apiKey: config.openAiApiKey, model: config.openAiModel });
    const result = await executor.invoke({ input: instruction });
    console.log('\nAgent:', result.output);
  } finally {
    await client.disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
