import { Wallet } from 'xrpl';
import { MAX_SPEND_XRP, buildTools } from '../../src/agent';
import { AgentContext } from '../../src/xrpl/client';

const ISSUER = 'rQ3fNyLjbvcDaPNS4EAJY8aT9zR3uGk17c';

function makeCtx(): AgentContext {
  return {
    client: { request: jest.fn() },
    wallet: Wallet.generate(),
    maxSpendXrp: MAX_SPEND_XRP,
  } as unknown as AgentContext;
}

describe('agent tool wiring', () => {
  it('exposes the DEX and NFT tools by name', () => {
    expect(buildTools(makeCtx()).map((t) => t.name)).toEqual(['placeDexOrder', 'buyNftTool', 'createNftOffer']);
  });

  it('reports a guardrail breach as a rejected tool result instead of signing', async () => {
    const ctx = makeCtx();
    const [placeDexOrderTool] = buildTools(ctx);

    const raw = await placeDexOrderTool.invoke({
      takerGets: { currency: 'XRP', value: '80' },
      takerPays: { currency: 'USD', value: '500', issuer: ISSUER },
    });

    expect(JSON.parse(raw as string)).toMatchObject({
      status: 'rejected',
      error: expect.stringContaining('exceeds the hard limit of 50 XRP'),
    });
    expect(ctx.client.request).not.toHaveBeenCalled();
  });
});
