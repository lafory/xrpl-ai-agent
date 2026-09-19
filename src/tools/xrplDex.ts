import { OfferCreate, OfferCreateFlags } from 'xrpl';
import { z } from 'zod';
import { AgentContext, SubmitResult, signAndSubmit } from '../xrpl/client';
import { AmountInput, amountSchema, describeAmount, toXrplAmount, xrpValueOf } from '../xrpl/amounts';
import { assertWithinSpendLimit } from '../guardrails';

export const placeDexOrderSchema = z.object({
  takerGets: amountSchema.describe('What this wallet gives up (sells) when the offer is consumed.'),
  takerPays: amountSchema.describe('What this wallet receives (buys) when the offer is consumed.'),
  immediateOrCancel: z
    .boolean()
    .nullish()
    .describe('If true, the offer never rests on the order book; unmatched portions are cancelled.'),
  fillOrKill: z.boolean().nullish().describe('If true, the offer must be filled entirely or not at all.'),
  passive: z.boolean().nullish().describe('If true, the offer does not consume offers with the same quality.'),
  expirationSeconds: z
    .number()
    .int()
    .positive()
    .nullish()
    .describe('Seconds from now after which an unfilled offer expires.'),
});

export type PlaceDexOrderInput = z.infer<typeof placeDexOrderSchema>;

export interface PlaceDexOrderResult extends SubmitResult {
  offerSequence: number;
  summary: string;
}

const RIPPLE_EPOCH_OFFSET_SECONDS = 946684800;

function buildFlags(input: PlaceDexOrderInput): number | undefined {
  let flags = 0;
  if (input.immediateOrCancel) flags |= OfferCreateFlags.tfImmediateOrCancel;
  if (input.fillOrKill) flags |= OfferCreateFlags.tfFillOrKill;
  if (input.passive) flags |= OfferCreateFlags.tfPassive;
  return flags === 0 ? undefined : flags;
}

export function buildOfferCreate(account: string, input: PlaceDexOrderInput): OfferCreate {
  if (input.immediateOrCancel && input.fillOrKill) {
    throw new Error('immediateOrCancel and fillOrKill are mutually exclusive.');
  }
  const transaction: OfferCreate = {
    TransactionType: 'OfferCreate',
    Account: account,
    TakerGets: toXrplAmount(input.takerGets),
    TakerPays: toXrplAmount(input.takerPays),
  };
  const flags = buildFlags(input);
  if (flags !== undefined) transaction.Flags = flags;
  if (input.expirationSeconds != null) {
    transaction.Expiration = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET_SECONDS + input.expirationSeconds;
  }
  return transaction;
}

/** The XRP this offer can cost us, used by the spending guardrail. */
export function spendXrpOf(takerGets: AmountInput): number {
  return xrpValueOf(takerGets);
}

export async function placeDexOrder(
  ctx: AgentContext,
  input: PlaceDexOrderInput,
): Promise<PlaceDexOrderResult> {
  assertWithinSpendLimit(spendXrpOf(input.takerGets), ctx.maxSpendXrp, 'placeDexOrder');

  const transaction = buildOfferCreate(ctx.wallet.classicAddress, input);
  const submitted = await signAndSubmit(ctx.client, ctx.wallet, transaction);

  const accountInfo = await ctx.client.request({
    command: 'tx',
    transaction: submitted.hash,
  });
  const offerSequence = Number(
    (accountInfo.result.tx_json as { Sequence?: number } | undefined)?.Sequence ??
      (accountInfo.result as unknown as { Sequence?: number }).Sequence ??
      0,
  );

  return {
    ...submitted,
    offerSequence,
    summary: `Offer selling ${describeAmount(input.takerGets)} for ${describeAmount(input.takerPays)} accepted by the ledger.`,
  };
}
