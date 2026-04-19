import { auditExtraction } from "./extraction-validation";
import {
  computePublicScoreComponents,
  getCallScoreStatus,
  getHorizonStatus,
  type CallScoreStatus,
  type HorizonStatus,
  type PublicScoreComponents,
} from "./public-methodology";
import type { Call } from "./types";

export interface SerializedCall extends Call {
  readonly extraction_valid: boolean;
  readonly extraction_notes: readonly string[];
  readonly score_status: CallScoreStatus;
  readonly public_score: number | null;
  readonly public_score_components: PublicScoreComponents | null;
  readonly horizon_status_7d: HorizonStatus;
  readonly horizon_status_30d: HorizonStatus;
  readonly horizon_status_90d: HorizonStatus;
  readonly target_status: HorizonStatus;
}

export interface CreatorScoreAverages {
  readonly direction: number;
  readonly alpha: number;
  readonly specificity: number;
  readonly regime: number;
  readonly target: number;
  readonly total: number;
  readonly scoredCount: number;
}

export function serializeCall(
  call: Call,
  now: Date = new Date(),
): SerializedCall {
  const extraction = auditExtraction(call);
  const scoreStatus = getCallScoreStatus(
    {
      extraction_confidence: call.extraction_confidence,
      call_date: call.call_date,
      target_price: call.target_price,
      price_30d: call.price_30d,
      price_90d: call.price_90d,
      return_30d: call.return_30d,
      hit_target: call.hit_target,
    },
    now,
  );
  const components =
    scoreStatus === "scored" ? computePublicScoreComponents(call) : null;

  return {
    ...call,
    extraction_valid: extraction.isValid,
    extraction_notes: extraction.reasons,
    score_status: scoreStatus,
    public_score: components?.total ?? null,
    public_score_components: components,
    horizon_status_7d: getHorizonStatus(
      call.call_date,
      "7d",
      call.price_7d !== null && call.return_7d !== null,
      now,
    ),
    horizon_status_30d: getHorizonStatus(
      call.call_date,
      "30d",
      call.price_30d !== null && call.return_30d !== null,
      now,
    ),
    horizon_status_90d: getHorizonStatus(
      call.call_date,
      "90d",
      call.price_90d !== null && call.return_90d !== null,
      now,
    ),
    target_status: getHorizonStatus(
      call.call_date,
      "90d",
      call.target_price === null || call.hit_target !== null,
      now,
    ),
  };
}

export function serializeCalls(
  calls: readonly Call[],
  now: Date = new Date(),
): SerializedCall[] {
  return calls.map((call) => serializeCall(call, now));
}

export function getScoredCalls(
  calls: readonly Call[],
  now: Date = new Date(),
): SerializedCall[] {
  return serializeCalls(calls, now).filter((call) => call.score_status === "scored");
}

export function computeCreatorScoreAverages(
  calls: readonly Call[],
  now: Date = new Date(),
): CreatorScoreAverages {
  const scoredCalls = getScoredCalls(calls, now);
  if (scoredCalls.length === 0) {
    return {
      direction: 0,
      alpha: 0,
      specificity: 0,
      regime: 0,
      target: 0,
      total: 0,
      scoredCount: 0,
    };
  }

  const totals = scoredCalls.reduce(
    (acc, call) => {
      const components = call.public_score_components!;
      return {
        direction: acc.direction + components.direction,
        alpha: acc.alpha + components.alpha,
        specificity: acc.specificity + components.specificity,
        regime: acc.regime + components.regime,
        target: acc.target + components.target,
        total: acc.total + components.total,
      };
    },
    { direction: 0, alpha: 0, specificity: 0, regime: 0, target: 0, total: 0 },
  );

  return {
    direction: totals.direction / scoredCalls.length,
    alpha: totals.alpha / scoredCalls.length,
    specificity: totals.specificity / scoredCalls.length,
    regime: totals.regime / scoredCalls.length,
    target: totals.target / scoredCalls.length,
    total: totals.total / scoredCalls.length,
    scoredCount: scoredCalls.length,
  };
}

export function computeCreatorWinRate(
  calls: readonly Call[],
  now: Date = new Date(),
): number {
  const scored = getScoredCalls(calls, now);
  if (scored.length === 0) return 0;
  const wins = scored.filter((call) => (call.return_30d ?? 0) > 0).length;
  return wins / scored.length;
}

export function computeCreatorAvgAlpha30d(
  calls: readonly Call[],
  now: Date = new Date(),
): number {
  const scored = getScoredCalls(calls, now);
  if (scored.length === 0) return 0;
  const sum = scored.reduce((acc, call) => acc + (call.alpha_30d ?? 0), 0);
  return sum / scored.length;
}

export function computeCreatorHitRate(
  calls: readonly Call[],
  now: Date = new Date(),
): number {
  const scored = getScoredCalls(calls, now);
  if (scored.length === 0) return 0;
  const hits = scored.filter((call) => call.hit_target === true).length;
  return hits / scored.length;
}
