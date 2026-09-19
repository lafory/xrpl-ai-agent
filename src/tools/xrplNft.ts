import { NFTokenAcceptOffer, NFTokenCreateOffer, NFTokenCreateOfferFlags, dropsToXrp } from 'xrpl';
import { z } from 'zod';
import { AgentContext, SubmitResult, signAndSubmit } from '../xrpl/client';
import { amountSchema, describeAmount, toXrplAmount, xrpValueOf } from '../xrpl/amounts';
import { assertWithinSpendLimit } from '../guardrails';

export const createNftOfferSchema = z.object({
  nftokenId: z.string().describe('The 64-character hex NFTokenID being offered.'),
  amount: amountSchema.describe('Price of the offer.'),
  side: z.enum(['sell', 'buy']).describe('"sell" to list an owned NFT, "buy" to bid on someone else\'s NFT.'),
  owner: z
    .string()
    .optional()
    .describe('Current owner of the NFT. Required for buy offers, forbidden for sell offers.'),
  destination: z.string().optional().describe('Restrict who may accept this offer.'),
});

export const acceptNftOfferSchema = z.object({
  nftokenOfferIndex: z.string().describe('The 64-character hex index of the NFTokenOffer ledger object to accept.'),
  side: z
    .enum(['sell', 'buy'])
    .describe('"sell" when accepting a sell offer (you buy the NFT), "buy" when accepting a buy offer (you sell it).'),
});

export type CreateNftOfferInput = z.infer<typeof createNftOfferSchema>;
export type AcceptNftOfferInput = z.infer<typeof acceptNftOfferSchema>;

export interface NftOfferLedgerEntry {
  Amount: string | { currency: string; issuer: string; value: string };
  Owner: string;
  NFTokenID: string;
  Flags: number;
  Destination?: string;
}

const HEX_256 = /^[0-9A-Fa-f]{64}$/;
const LSF_SELL_NFTOKEN = 1;

export function buildNftCreateOffer(account: string, input: CreateNftOfferInput): NFTokenCreateOffer {
  if (!HEX_256.test(input.nftokenId)) {
    throw new Error(`Invalid NFTokenID "${input.nftokenId}": expected 64 hex characters.`);
  }
  if (input.side === 'buy' && !input.owner) {
    throw new Error('Buy offers must specify the current owner of the NFT.');
  }
  if (input.side === 'sell' && input.owner) {
    throw new Error('Sell offers must not specify an owner.');
  }
  const transaction: NFTokenCreateOffer = {
    TransactionType: 'NFTokenCreateOffer',
    Account: account,
    NFTokenID: input.nftokenId,
    Amount: toXrplAmount(input.amount),
  };
  if (input.side === 'sell') transaction.Flags = NFTokenCreateOfferFlags.tfSellNFToken;
  if (input.owner) transaction.Owner = input.owner;
  if (input.destination) transaction.Destination = input.destination;
  return transaction;
}

export async function createNftOffer(ctx: AgentContext, input: CreateNftOfferInput): Promise<SubmitResult & { summary: string }> {
  if (input.side === 'buy') {
    assertWithinSpendLimit(xrpValueOf(input.amount), ctx.maxSpendXrp, 'createNftOffer(buy)');
  }
  const transaction = buildNftCreateOffer(ctx.wallet.classicAddress, input);
  const submitted = await signAndSubmit(ctx.client, ctx.wallet, transaction);
  return {
    ...submitted,
    summary: `${input.side === 'sell' ? 'Sell' : 'Buy'} offer for NFT ${input.nftokenId} at ${describeAmount(input.amount)} created.`,
  };
}

export async function fetchNftOffer(ctx: AgentContext, nftokenOfferIndex: string): Promise<NftOfferLedgerEntry> {
  if (!HEX_256.test(nftokenOfferIndex)) {
    throw new Error(`Invalid NFTokenOfferIndex "${nftokenOfferIndex}": expected 64 hex characters.`);
  }
  const response = await ctx.client.request({
    command: 'ledger_entry',
    nft_offer: nftokenOfferIndex,
    ledger_index: 'validated',
  });
  return response.result.node as unknown as NftOfferLedgerEntry;
}

export function offerXrpCost(offer: NftOfferLedgerEntry): number {
  return typeof offer.Amount === 'string' ? Number(dropsToXrp(offer.Amount)) : 0;
}

/**
 * Accepts an existing NFTokenOffer. The offer is read from the validated ledger first so the
 * price, owner and sell/buy side can be checked before anything is signed.
 */
export async function buyNft(ctx: AgentContext, input: AcceptNftOfferInput): Promise<SubmitResult & { summary: string }> {
  const offer = await fetchNftOffer(ctx, input.nftokenOfferIndex);
  const isSellOffer = (offer.Flags & LSF_SELL_NFTOKEN) === LSF_SELL_NFTOKEN;

  if (input.side === 'sell' && !isSellOffer) {
    throw new Error(`Offer ${input.nftokenOfferIndex} is a buy offer, but it was submitted as a sell offer.`);
  }
  if (input.side === 'buy' && isSellOffer) {
    throw new Error(`Offer ${input.nftokenOfferIndex} is a sell offer, but it was submitted as a buy offer.`);
  }
  if (offer.Owner === ctx.wallet.classicAddress) {
    throw new Error('Refusing to accept an offer created by this wallet.');
  }
  if (offer.Destination && offer.Destination !== ctx.wallet.classicAddress) {
    throw new Error(`Offer ${input.nftokenOfferIndex} is reserved for ${offer.Destination}.`);
  }

  if (input.side === 'sell') {
    assertWithinSpendLimit(offerXrpCost(offer), ctx.maxSpendXrp, 'buyNft');
  }

  const transaction: NFTokenAcceptOffer = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: ctx.wallet.classicAddress,
    ...(input.side === 'sell'
      ? { NFTokenSellOffer: input.nftokenOfferIndex }
      : { NFTokenBuyOffer: input.nftokenOfferIndex }),
  };

  const submitted = await signAndSubmit(ctx.client, ctx.wallet, transaction);
  return {
    ...submitted,
    summary: `Accepted ${input.side} offer ${input.nftokenOfferIndex} for NFT ${offer.NFTokenID}.`,
  };
}
