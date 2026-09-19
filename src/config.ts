import * as dotenv from 'dotenv';

dotenv.config();

export const TESTNET_RPC_URL = 'wss://s.altnet.rippletest.net:51233';

const MAINNET_HOSTS = ['xrplcluster.com', 's1.ripple.com', 's2.ripple.com'];

export interface AppConfig {
  rpcUrl: string;
  seed: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel: string;
  openAiMaxTokens?: number;
  maxSpendXrp: number;
}

export function getRpcUrl(): string {
  const url = process.env.XRPL_RPC_URL?.trim() || TESTNET_RPC_URL;
  assertNotMainnet(url);
  return url;
}

export function assertNotMainnet(url: string): void {
  const host = url.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  if (MAINNET_HOSTS.includes(host)) {
    throw new Error(`Refusing to connect to XRPL Mainnet node "${host}". This agent is Testnet-only.`);
  }
}

export function getSeed(): string {
  const seed = process.env.XRPL_SEED?.trim();
  if (!seed) {
    throw new Error('XRPL_SEED is not set. Copy .env.example to .env and run `npm run faucet` to create one.');
  }
  return seed;
}

export function getMaxSpendXrp(): number {
  const raw = process.env.MAX_SPEND_XRP?.trim();
  if (!raw) return 50;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`MAX_SPEND_XRP must be a positive number, got "${raw}".`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  return {
    rpcUrl: getRpcUrl(),
    seed: getSeed(),
    openAiApiKey: process.env.OPENAI_API_KEY?.trim(),
    openAiBaseUrl: process.env.OPENAI_BASE_URL?.trim(),
    openAiModel: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    openAiMaxTokens: process.env.OPENAI_MAX_TOKENS ? Number(process.env.OPENAI_MAX_TOKENS) : undefined,
    maxSpendXrp: getMaxSpendXrp(),
  };
}
