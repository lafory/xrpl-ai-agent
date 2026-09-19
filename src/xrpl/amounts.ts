import { Amount, xrpToDrops } from 'xrpl';
import { z } from 'zod';

export const amountSchema = z.object({
  currency: z
    .string()
    .describe('Currency code. Use "XRP" for drops-denominated native XRP, otherwise a 3-letter code or 40-char hex code.'),
  value: z.string().describe('Decimal amount as a string, e.g. "12.5".'),
  issuer: z
    .string()
    .nullish()
    .describe('Account address that issues the token. Required for every currency except XRP, null otherwise.'),
});

export type AmountInput = z.infer<typeof amountSchema>;

export function isXrp(amount: AmountInput): boolean {
  return amount.currency.toUpperCase() === 'XRP';
}

export function toXrplAmount(amount: AmountInput): Amount {
  const value = amount.value.trim();
  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
    throw new Error(`Invalid amount value "${amount.value}": expected a positive decimal string.`);
  }
  if (isXrp(amount)) {
    if (amount.issuer) {
      throw new Error('XRP amounts must not specify an issuer.');
    }
    return xrpToDrops(value);
  }
  if (!amount.issuer) {
    throw new Error(`Issued currency "${amount.currency}" requires an issuer address.`);
  }
  return { currency: amount.currency, issuer: amount.issuer, value };
}

export function xrpValueOf(amount: AmountInput): number {
  return isXrp(amount) ? Number(amount.value) : 0;
}

export function describeAmount(amount: AmountInput): string {
  return isXrp(amount) ? `${amount.value} XRP` : `${amount.value} ${amount.currency}.${amount.issuer}`;
}
