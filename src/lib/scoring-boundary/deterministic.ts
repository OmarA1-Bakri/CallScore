export interface PricePoint {
  readonly marketSymbol: string;
  readonly observedAt: string;
  readonly priceUsd: number;
  readonly provider: string;
}

export interface PriceResolutionInput {
  readonly marketSymbol: string;
  readonly callTimestamp: string;
  readonly horizonTimestamp: string;
  readonly candles: readonly PricePoint[];
}

export interface PriceResolutionResult {
  readonly marketSymbol: string;
  readonly entry: PricePoint;
  readonly horizon: PricePoint;
  readonly provider: string;
  readonly method: "nearest_observation";
}

export interface ScoreEvaluationInput {
  readonly callId: string;
  readonly marketSymbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly confidence: number;
  readonly priceResolution: PriceResolutionResult;
}

export interface ScoreEvaluationResult {
  readonly callId: string;
  readonly marketSymbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly entryPriceUsd: number;
  readonly horizonPriceUsd: number;
  readonly returnPct: number;
  readonly correctDirection: boolean | null;
  readonly score: number;
  readonly method: "directional_return_v1";
}

function assertFinitePrice(point: PricePoint): void {
  if (!Number.isFinite(point.priceUsd) || point.priceUsd <= 0) throw new Error("invalid_price_point");
}

function distanceMs(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime());
}

function nearest(candles: readonly PricePoint[], marketSymbol: string, timestamp: string): PricePoint {
  const candidates = candles.filter((point) => point.marketSymbol === marketSymbol);
  if (candidates.length === 0) throw new Error(`missing_price_points:${marketSymbol}`);
  const sorted = [...candidates].sort((a, b) => distanceMs(a.observedAt, timestamp) - distanceMs(b.observedAt, timestamp));
  const point = sorted[0];
  assertFinitePrice(point);
  return point;
}

export function resolveDeterministicPrice(input: PriceResolutionInput): PriceResolutionResult {
  const entry = nearest(input.candles, input.marketSymbol, input.callTimestamp);
  const horizon = nearest(input.candles, input.marketSymbol, input.horizonTimestamp);
  if (entry.provider !== horizon.provider) throw new Error("mixed_price_providers_not_allowed");
  return {
    marketSymbol: input.marketSymbol,
    entry,
    horizon,
    provider: entry.provider,
    method: "nearest_observation",
  };
}

export function evaluateDirectionalScore(input: ScoreEvaluationInput): ScoreEvaluationResult {
  const entry = input.priceResolution.entry.priceUsd;
  const horizon = input.priceResolution.horizon.priceUsd;
  const rawReturn = ((horizon - entry) / entry) * 100;
  const signedReturn = input.direction === "bearish" ? -rawReturn : input.direction === "bullish" ? rawReturn : 0;
  const correctDirection = input.direction === "neutral" ? null : signedReturn > 0;
  const confidenceMultiplier = Math.max(0, Math.min(1, input.confidence));
  const score = Number((signedReturn * confidenceMultiplier).toFixed(6));
  return {
    callId: input.callId,
    marketSymbol: input.marketSymbol,
    direction: input.direction,
    entryPriceUsd: entry,
    horizonPriceUsd: horizon,
    returnPct: Number(rawReturn.toFixed(6)),
    correctDirection,
    score,
    method: "directional_return_v1",
  };
}
