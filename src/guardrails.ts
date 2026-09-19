export const DEFAULT_MAX_SPEND_XRP = 50;

export class SpendLimitError extends Error {
  constructor(
    readonly requestedXrp: number,
    readonly limitXrp: number,
    context: string,
  ) {
    super(
      `Spending guardrail triggered: ${context} would spend ${requestedXrp} XRP, ` +
        `which exceeds the hard limit of ${limitXrp} XRP.`,
    );
    this.name = 'SpendLimitError';
  }
}

export function assertWithinSpendLimit(requestedXrp: number, limitXrp: number, context: string): void {
  if (!Number.isFinite(requestedXrp) || requestedXrp < 0) {
    throw new Error(`Invalid spend amount "${requestedXrp}" for ${context}.`);
  }
  if (requestedXrp > limitXrp) {
    throw new SpendLimitError(requestedXrp, limitXrp, context);
  }
}
