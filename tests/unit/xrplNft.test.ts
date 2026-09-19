import { NFTokenCreateOfferFlags, Wallet } from 'xrpl';
import { buildNftCreateOffer, buyNft } from '../../src/tools/xrplNft';
import { SpendLimitError } from '../../src/guardrails';
import { AgentContext } from '../../src/xrpl/client';

const NFT_ID = '00080000B4F4AFC5FBCBD76873F18006173D2193467D3EE70000099B00000000';
const OFFER_INDEX = 'AEBABA4FAC212BF28E0F9A9C3788A47B085557EC5D1429E7A8266FB859C863B3';
const OWNER = 'rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w';

function makeCtx(node: Record<string, unknown>, wallet = Wallet.generate()): AgentContext {
  return {
    client: { request: jest.fn().mockResolvedValue({ result: { node } }) },
    wallet,
    maxSpendXrp: 50,
  } as unknown as AgentContext;
}

describe('buildNftCreateOffer', () => {
  it('flags sell offers and forbids an owner on them', () => {
    const tx = buildNftCreateOffer(OWNER, {
      nftokenId: NFT_ID,
      amount: { currency: 'XRP', value: '2' },
      side: 'sell',
    });
    expect(tx).toMatchObject({ TransactionType: 'NFTokenCreateOffer', Amount: '2000000' });
    expect(tx.Flags).toBe(NFTokenCreateOfferFlags.tfSellNFToken);

    expect(() =>
      buildNftCreateOffer(OWNER, {
        nftokenId: NFT_ID,
        amount: { currency: 'XRP', value: '2' },
        side: 'sell',
        owner: OWNER,
      }),
    ).toThrow(/must not specify an owner/);
  });

  it('requires an owner on buy offers and a valid NFTokenID', () => {
    expect(() =>
      buildNftCreateOffer(OWNER, { nftokenId: NFT_ID, amount: { currency: 'XRP', value: '2' }, side: 'buy' }),
    ).toThrow(/must specify the current owner/);

    expect(() =>
      buildNftCreateOffer(OWNER, { nftokenId: 'not-hex', amount: { currency: 'XRP', value: '2' }, side: 'buy', owner: OWNER }),
    ).toThrow(/Invalid NFTokenID/);
  });
});

describe('buyNft pre-flight checks', () => {
  it('rejects an offer whose side does not match', async () => {
    const ctx = makeCtx({ Amount: '1000000', Owner: OWNER, NFTokenID: NFT_ID, Flags: 0 });
    await expect(buyNft(ctx, { nftokenOfferIndex: OFFER_INDEX, side: 'sell' })).rejects.toThrow(/is a buy offer/);
  });

  it('rejects offers created by the agent wallet itself', async () => {
    const wallet = Wallet.generate();
    const ctx = makeCtx({ Amount: '1000000', Owner: wallet.classicAddress, NFTokenID: NFT_ID, Flags: 1 }, wallet);
    await expect(buyNft(ctx, { nftokenOfferIndex: OFFER_INDEX, side: 'sell' })).rejects.toThrow(/created by this wallet/);
  });

  it('rejects offers reserved for a different destination', async () => {
    const ctx = makeCtx({ Amount: '1000000', Owner: OWNER, NFTokenID: NFT_ID, Flags: 1, Destination: OWNER });
    await expect(buyNft(ctx, { nftokenOfferIndex: OFFER_INDEX, side: 'sell' })).rejects.toThrow(/reserved for/);
  });

  it('enforces the spending guardrail on the offer price', async () => {
    const ctx = makeCtx({ Amount: '60000000', Owner: OWNER, NFTokenID: NFT_ID, Flags: 1 });
    await expect(buyNft(ctx, { nftokenOfferIndex: OFFER_INDEX, side: 'sell' })).rejects.toThrow(SpendLimitError);
  });

  it('rejects malformed offer indexes before any network call', async () => {
    const ctx = makeCtx({});
    await expect(buyNft(ctx, { nftokenOfferIndex: 'abc', side: 'sell' })).rejects.toThrow(/Invalid NFTokenOfferIndex/);
    expect(ctx.client.request).not.toHaveBeenCalled();
  });
});
