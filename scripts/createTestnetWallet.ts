import { Client } from 'xrpl';
import { TESTNET_RPC_URL, assertNotMainnet } from '../src/config';

/** Funds a fresh Testnet wallet from the faucet and prints the seed for .env. */
async function main(): Promise<void> {
  const rpcUrl = process.env.XRPL_RPC_URL?.trim() || TESTNET_RPC_URL;
  assertNotMainnet(rpcUrl);

  const client = new Client(rpcUrl);
  await client.connect();
  try {
    const { wallet, balance } = await client.fundWallet();
    console.log('Funded Testnet wallet');
    console.log(`  address: ${wallet.classicAddress}`);
    console.log(`  balance: ${balance} XRP`);
    console.log('\nAdd this to your .env:');
    console.log(`XRPL_SEED=${wallet.seed}`);
  } finally {
    await client.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
