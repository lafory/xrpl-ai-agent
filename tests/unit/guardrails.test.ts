import { DEFAULT_MAX_SPEND_XRP, SpendLimitError, assertWithinSpendLimit } from '../../src/guardrails';
import { MAX_SPEND_XRP } from '../../src/agent';

describe('spending guardrail', () => {
  it('hard-caps agent spending at 50 XRP', () => {
    expect(DEFAULT_MAX_SPEND_XRP).toBe(50);
    expect(MAX_SPEND_XRP).toBe(50);
  });

  it('allows spends at or below the limit', () => {
    expect(() => assertWithinSpendLimit(49.999999, 50, 'test')).not.toThrow();
    expect(() => assertWithinSpendLimit(50, 50, 'test')).not.toThrow();
  });

  it('throws SpendLimitError above the limit', () => {
    expect(() => assertWithinSpendLimit(50.000001, 50, 'test')).toThrow(SpendLimitError);
    expect(() => assertWithinSpendLimit(1000, 50, 'placeDexOrder')).toThrow(/exceeds the hard limit of 50 XRP/);
  });

  it('rejects nonsensical amounts', () => {
    expect(() => assertWithinSpendLimit(Number.NaN, 50, 'test')).toThrow();
    expect(() => assertWithinSpendLimit(-1, 50, 'test')).toThrow();
  });
});
