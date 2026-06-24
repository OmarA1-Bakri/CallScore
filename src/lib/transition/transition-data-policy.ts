import type { HardeningStatus, PipelineGuardAudit } from "../pipeline-guard-audit";

export const FORBIDDEN_TRANSITION_SOURCES = ["creator_stats.30d", "stale_candle_daily_closes", "raw_ml_verifier_labels"] as const;
export const CANONICAL_TRANSITION_SOURCES = ["calls", "videos", "candles", "candles_1h", "candles_4h"] as const;

export function assertTransitionSourceAllowed(source: string): void {
  if (source === "creator_stats.30d") throw new Error("creator_stats.30d is not allowed for transition modelling; use raw calls.");
  if (source === "raw_ml_verifier_labels") throw new Error("raw ml_verification_runs labels are not allowed; use ml-verifier-label-policy.");
  if (source === "stale_candle_daily_closes") throw new Error("stale candle_daily_closes are not allowed; use raw/hourly candles or refresh derived closes.");
}

function checkStatus(audit: PipelineGuardAudit, id: string): HardeningStatus | null {
  return audit.checks.find((check) => check.id === id)?.status ?? null;
}

export function transitionCanProceedWithGuard(audit: PipelineGuardAudit): boolean {
  const sourceBlocked = ["creator_stats_30d", "ml_verifier_label_integrity", "daily_closes_lag", "creator_news_channel_exclusion"]
    .some((id) => checkStatus(audit, id) === "block");
  return !sourceBlocked;
}

export function transitionDataPolicySummary(): string {
  return "Use raw calls plus raw/hourly candles; exclude news/media creators; never use creator_stats.30d or raw verifier labels as truth.";
}
