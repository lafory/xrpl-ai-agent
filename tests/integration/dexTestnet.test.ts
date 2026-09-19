import { Client, NFTokenMint, NFTokenMintFlags, convertStringToHex } from 'xrpl';
import { TESTNET_RPC_URL } from '../../src/config';
import { AgentContext, signAndSubmit } from '../../src/xrpl/client';
import { placeDexOrder } from '../../src/tools/xrplDex';
import { buyNft, createNftOffer } from '../../src/tools/xrplNft';

jest.setTimeout(300000);

const RPC_URL = process.env.XRPL_RPC_URL?.trim() || TESTNET_RPC_URL;

describe('XRPL Testnet integration', () => {
  let client: Client;
  let ctx: AgentContext;
  let issuer: string;

  beforeAll(async () => {
    client = new Client(RPC_URL);
    await client.connect();
    const { wallet } = await client.fundWallet();
    ctx = { client, wallet, maxSpendXrp: 50 };
    // The token side of an offer must reference an account that exists on the ledger.
    const funded = await client.fundWallet();
    issuer = funded.wallet.classicAddress;
  });

  afterAll(async () => {
    if (client?.isConnected()) await client.disconnect();
  });

  it('funds a fresh faucet wallet', async () => {
    const balance = await client.getXrpBalance(ctx.wallet.classicAddress);
    expect(balance).toBeGreaterThan(0);
  });

  it('creates a resting offer on the DEX order book', async () => {
    const result = await placeDexOrder(ctx, {
      takerGets: { currency: 'XRP', value: '1' },
      takerPays: { currency: 'USD', value: '20', issuer },
    });

    expect(result.engineResult).toBe('tesSUCCESS');
    expect(result.validated).toBe(true);
    expect(result.hash).toMatch(/^[0-9A-F]{64}$/);

    const offers = await client.request({
      command: 'account_offers',
      account: ctx.wallet.classicAddress,
      ledger_index: 'validated',
    });
    const matching = offers.result.offers?.filter((offer) => offer.taker_gets === '1000000');
    expect(matching?.length).toBeGreaterThan(0);
  });

  it('rejects an offer that exceeds the spending guardrail', async () => {
    await expect(
      placeDexOrder(ctx, {
        takerGets: { currency: 'XRP', value: '75' },
        takerPays: { currency: 'USD', value: '1', issuer },
      }),
    ).rejects.toThrow(/exceeds the hard limit/);
  });

  it('mints, lists and buys an XLS-20 NFT through NFTokenAcceptOffer', async () => {
    const { wallet: seller } = await client.fundWallet();
    const sellerCtx: AgentContext = { client, wallet: seller, maxSpendXrp: 50 };

    const mint: NFTokenMint = {
      TransactionType: 'NFTokenMint',
      Account: seller.classicAddress,
      NFTokenTaxon: 0,
      Flags: NFTokenMintFlags.tfTransferable,
      URI: convertStringToHex('ipfs://devin-xrpl-agent-test'),
    };
    await signAndSubmit(client, seller, mint);

    const owned = await client.request({
      command: 'account_nfts',
      account: seller.classicAddress,
      ledger_index: 'validated',
    });
    const nftokenId = owned.result.account_nfts[0].NFTokenID;

    await createNftOffer(sellerCtx, {
      nftokenId,
      amount: { currency: 'XRP', value: '1' },
      side: 'sell',
    });

    const sellOffers = await client.request({
      command: 'nft_sell_offers',
      nft_id: nftokenId,
      ledger_index: 'validated',
    });
    const offerIndex = sellOffers.result.offers[0].nft_offer_index;

    const bought = await buyNft(ctx, { nftokenOfferIndex: offerIndex, side: 'sell' });
    expect(bought.engineResult).toBe('tesSUCCESS');

    const buyerNfts = await client.request({
      command: 'account_nfts',
      account: ctx.wallet.classicAddress,
      ledger_index: 'validated',
    });
    expect(buyerNfts.result.account_nfts.map((nft) => nft.NFTokenID)).toContain(nftokenId);
  });
});
