# xrpl-ai-agent

Autonomous AI agent that manages a self-sovereign XRP wallet on the **XRPL Testnet**. It trades on the
native XRPL DEX and on XLS-20 NFTs through LangChain tool calling. Backend runner only — no UI, no Mainnet.

## Layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Entry point: connects to the Testnet RPC node, loads the wallet, runs the agent. |
| `src/agent.ts` | LangChain tool-calling agent, tool wiring and the `MAX_SPEND_XRP` guardrail. |
| `src/guardrails.ts` | `assertWithinSpendLimit` / `SpendLimitError`. |
| `src/tools/xrplDex.ts` | `placeDexOrder` — builds, signs and submits `OfferCreate`. |
| `src/tools/xrplNft.ts` | `buyNftTool` (`NFTokenAcceptOffer`) and `createNftOffer` (`NFTokenCreateOffer`). |
| `src/xrpl/` | Client/wallet helpers and amount conversion. |
| `scripts/createTestnetWallet.ts` | Funds a Testnet wallet via `client.fundWallet()` (faucet). |
| `tests/` | Jest unit tests plus a live Testnet integration suite. |

## Setup

```bash
npm install
cp .env.example .env
npm run faucet   # prints a funded Testnet address + seed; paste the seed into .env
```

Environment variables (see `.env.example`): `XRPL_RPC_URL`, `XRPL_SEED`, `OPENAI_API_KEY`, and the
optional `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `MAX_SPEND_XRP`.

Any OpenAI-compatible provider works — for OpenRouter set `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
and `OPENAI_MODEL=openai/gpt-4o`.

## Run

```bash
npm run build
npm run dev -- "Sell 1 XRP for 20 USD issued by rXXXX... as a passive offer"
```

The seed is read from the environment and used only for local signing; it is never placed in a prompt
or tool argument, and the LLM only ever sees the wallet's public address.

## Safety

- Hard cap of `MAX_SPEND_XRP = 50` per transaction, enforced both in `src/agent.ts` (before a tool runs)
  and inside each tool (before anything is signed). Exceeding it throws `SpendLimitError`.
- `src/config.ts` refuses to connect to known Mainnet hosts.
- `buyNft` reads the `NFTokenOffer` from the validated ledger first and checks the sell/buy side, the
  destination restriction, self-dealing and the price before signing.
- Every transaction goes through `client.autofill()` → `validate()` → `wallet.sign()` →
  `client.submitAndWait()`, and non-`tes*` engine results throw.
- Tools return `{"status":"submitted"|"rejected", ...}` so a blocked trade cannot be reported to the
  user as a success by the model.

## Checks

```bash
npm run lint
npm run typecheck
npm run test:unit      # offline
npm run test:testnet   # live: funds faucet wallets and submits real Testnet transactions
```

`tests/integration/dexTestnet.test.ts` runs against `wss://s.altnet.rippletest.net:51233`: it funds a
faucet wallet, places an `OfferCreate` and asserts the offer is on the account's order book, then mints,
lists and buys an NFT to exercise `NFTokenAcceptOffer`.

## Pinned dependency versions

`zod` is pinned to `3.23.8` and `@langchain/core` to `0.3.40` (with a `zod-to-json-schema` override):
newer `zod` 3.25 releases make the LangChain `tool()` generics blow up with TS2589 under `tsc`.
