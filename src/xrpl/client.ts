import { Client, SubmittableTransaction, TxResponse, Wallet, validate } from 'xrpl';
import { assertNotMainnet, getRpcUrl, getSeed } from '../config';

export interface AgentContext {
  client: Client;
  wallet: Wallet;
  maxSpendXrp: number;
}

export async function connectClient(rpcUrl: string = getRpcUrl()): Promise<Client> {
  assertNotMainnet(rpcUrl);
  const client = new Client(rpcUrl);
  await client.connect();
  return client;
}

export function walletFromSeed(seed: string = getSeed()): Wallet {
  return Wallet.fromSeed(seed);
}

export interface SubmitResult {
  hash: string;
  engineResult: string;
  validated: boolean;
  ledgerIndex?: number;
}

/**
 * Autofills, validates, signs and submits a transaction, waiting for validation.
 * Throws when the ledger reports anything other than a `tes*` success code.
 */
export async function signAndSubmit(
  client: Client,
  wallet: Wallet,
  transaction: SubmittableTransaction,
): Promise<SubmitResult> {
  const prepared = await client.autofill(transaction);
  validate(prepared as unknown as Record<string, unknown>);
  const signed = wallet.sign(prepared);
  const response: TxResponse<SubmittableTransaction> = await client.submitAndWait(signed.tx_blob);

  const meta = response.result.meta;
  const engineResult = typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
    ? meta.TransactionResult
    : 'UNKNOWN';

  if (!engineResult.startsWith('tes')) {
    throw new Error(`Transaction ${transaction.TransactionType} failed with ${engineResult} (hash ${response.result.hash}).`);
  }

  return {
    hash: response.result.hash,
    engineResult,
    validated: response.result.validated === true,
    ledgerIndex: response.result.ledger_index,
  };
}
