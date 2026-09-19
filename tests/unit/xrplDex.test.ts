import { OfferCreateFlags, Wallet } from 'xrpl';
import { buildOfferCreate, placeDexOrder } from '../../src/tools/xrplDex';
import { SpendLimitError } from '../../src/guardrails';
import { AgentContext } from '../../src/xrpl/client';

const ISSUER = 'rQ3fNyLjbvcDaPNS4EAJY8aT9zR3uGk17c';
const ACCOUNT = 'rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w';

describe('buildOfferCreate', () => {
  it('converts XRP amounts to drops and keeps issued currencies intact', () => {
    const tx = buildOfferCreate(ACCOUNT, {
      takerGets: { currency: 'XRP', value: '1.5' },
      takerPays: { currency: 'USD', value: '2', issuer: ISSUER },
    });

    expect(tx).toMatchObject({
      TransactionType: 'OfferCreate',
      Account: ACCOUNT,
      TakerGets: '1500000',
      TakerPays: { currency: 'USD', issuer: ISSUER, value: '2' },
    });
    expect(tx.Flags).toBeUndefined();
  });

  it('maps order options to OfferCreate flags', () => {
    const tx = buildOfferCreate(ACCOUNT, {
      takerGets: { currency: 'XRP', value: '1' },
      takerPays: { currency: 'USD', value: '1', issuer: ISSUER },
      immediateOrCancel: true,
      passive: true,
    });
    expect(tx.Flags).toBe(OfferCreateFlags.tfImmediateOrCancel | OfferCreateFlags.tfPassive);
  });

  it('rejects contradictory and malformed inputs', () => {
    expect(() =>
      buildOfferCreate(ACCOUNT, {
        takerGets: { currency: 'XRP', value: '1' },
        takerPays: { currency: 'USD', value: '1', issuer: ISSUER },
        immediateOrCancel: true,
        fillOrKill: true,
      }),
    ).toThrow(/mutually exclusive/);

    expect(() =>
      buildOfferCreate(ACCOUNT, {
        takerGets: { currency: 'USD', value: '1' },
        takerPays: { currency: 'XRP', value: '1' },
      }),
    ).toThrow(/requires an issuer/);

    expect(() =>
      buildOfferCreate(ACCOUNT, {
        takerGets: { currency: 'XRP', value: '0' },
        takerPays: { currency: 'USD', value: '1', issuer: ISSUER },
      }),
    ).toThrow(/positive decimal/);
  });
});

describe('placeDexOrder guardrail', () => {
  it('refuses to sign when the offer sells more XRP than the limit', async () => {
    const submit = jest.fn();
    const ctx = {
      client: { request: submit },
      wallet: Wallet.generate(),
      maxSpendXrp: 50,
    } as unknown as AgentContext;

    await expect(
      placeDexOrder(ctx, {
        takerGets: { currency: 'XRP', value: '51' },
        takerPays: { currency: 'USD', value: '1', issuer: ISSUER },
      }),
    ).rejects.toThrow(SpendLimitError);
    expect(submit).not.toHaveBeenCalled();
  });
});
