import type { Call } from "./types";

export const SCORE_WEIGHTS = {
  direction: 40,
  alpha: 25,
  specificity: 15,
  regime: 10,
  target: 10,
} as const;

export const EXTRACTION_CONFIDENCE_THRESHOLD = 0.7;

export const HORIZON_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

export type HorizonKey = keyof typeof HORIZON_DAYS;
export type HorizonStatus = "pending" | "available";
export type CallScoreStatus =
  | "scored"
  | "excluded_confidence"
  | "invalid_extraction"
  | "pending_horizon";

export const PUBLIC_COUNT_LABELS = {
  trackedCreators: "Tracked Creators",
  rankedCreators: "Creators Ranked",
  trackedCalls: "Tracked Calls",
  scoredCalls: "Scored Calls",
} as const;

export interface PublicScoreComponents {
  readonly direction: number;
  readonly alpha: number;
  readonly specificity: number;
  readonly regime: number;
  readonly target: number;
  readonly total: number;
}

type ScoreInput = Pick<
  Call,
  "correct_direction" | "alpha_30d" | "specificity_score" | "regime_difficulty" | "hit_target"
>;

interface ScoreStatusInput {
  readonly extraction_confidence: number;
  readonly call_date: string;
  readonly price_at_call?: number | null;
  readonly target_price: number | null;
  readonly price_30d: number | null;
  readonly price_90d: number | null;
  readonly return_30d: number | null;
  readonly hit_target: boolean | null;
  readonly invalid_extraction?: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getHorizonDate(callDate: string, horizon: HorizonKey): Date {
  const base = new Date(callDate);
  const days = HORIZON_DAYS[horizon];
  return new Date(base.getTime() + days * 86_400_000);
}

export function hasHorizonElapsed(
  callDate: string,
  horizon: HorizonKey,
  now: Date = new Date(),
): boolean {
  return getHorizonDate(callDate, horizon).getTime() <= now.getTime();
}

export function getHorizonStatus(
  callDate: string,
  horizon: HorizonKey,
  hasStoredValue: boolean,
  now: Date = new Date(),
): HorizonStatus {
  if (!hasHorizonElapsed(callDate, horizon, now)) return "pending";
  return hasStoredValue ? "available" : "pending";
}

export function computePublicScoreComponents(call: ScoreInput): PublicScoreComponents {
  const direction = call.correct_direction ? SCORE_WEIGHTS.direction : 0;
  const alpha = clamp((call.alpha_30d ?? 0) * 2.5, 0, SCORE_WEIGHTS.alpha);
  const specificity = clamp(
    (call.specificity_score ?? 0) * SCORE_WEIGHTS.specificity,
    0,
    SCORE_WEIGHTS.specificity,
  );
  const regime = clamp(
    (call.regime_difficulty ?? 0) * SCORE_WEIGHTS.regime,
    0,
    SCORE_WEIGHTS.regime,
  );
  const target = call.hit_target ? SCORE_WEIGHTS.target : 0;
  const total = direction + alpha + specificity + regime + target;

  return {
    direction,
    alpha,
    specificity,
    regime,
    target,
    total,
  };
}

export function computePublicScore(call: ScoreInput): number {
  return computePublicScoreComponents(call).total;
}

export function getCallScoreStatus(
  call: ScoreStatusInput,
  now: Date = new Date(),
): CallScoreStatus {
  if (call.invalid_extraction) return "invalid_extraction";
  if (call.extraction_confidence < EXTRACTION_CONFIDENCE_THRESHOLD) {
    return "excluded_confidence";
  }
  if (call.price_at_call === null) return "pending_horizon";
  if (
    !hasHorizonElapsed(call.call_date, "30d", now) ||
    call.price_30d === null ||
    call.return_30d === null
  ) {
    return "pending_horizon";
  }
  if (
    call.target_price !== null &&
    (
      !hasHorizonElapsed(call.call_date, "90d", now) ||
      call.price_90d === null ||
      call.hit_target === null
    )
  ) {
    return "pending_horizon";
  }
  return "scored";
}

export function getCallEligibilitySql(alias = "c"): string {
  return [
    `${alias}.extraction_confidence >= ${EXTRACTION_CONFIDENCE_THRESHOLD}`,
    getScoreReadyIgnoringConfidenceSql(alias),
  ].join(" AND ");
}

export function getScoreReadyIgnoringConfidenceSql(alias = "c"): string {
  return [
    `${alias}.price_at_call IS NOT NULL`,
    `${alias}.return_30d IS NOT NULL`,
    `${alias}.price_30d IS NOT NULL`,
    `${alias}.call_date <= NOW() - INTERVAL '30 days'`,
    `(${alias}.target_price IS NULL OR (${alias}.call_date <= NOW() - INTERVAL '90 days' AND ${alias}.price_90d IS NOT NULL AND ${alias}.hit_target IS NOT NULL))`,
  ].join(" AND ");
}
