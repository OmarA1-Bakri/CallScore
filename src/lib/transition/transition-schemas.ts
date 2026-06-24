export type TransitionPeriod = "weekly" | "monthly" | "quarterly";

export type CreatorTransitionState =
  | "INSUFFICIENT_DATA"
  | "PROVISIONAL_SIGNAL"
  | "STABLE_PERFORMER"
  | "HOT_STREAK"
  | "COLD_STREAK"
  | "DETERIORATING"
  | "RECOVERING"
  | "DIRECTIONAL_BIAS_RISK"
  | "HIGH_VOLATILITY"
  | "STALE_OR_INACTIVE";

export interface TransitionCreatorRow {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly focus: string | null;
  readonly entity_type?: string | null;
  readonly is_news_channel?: boolean | null;
  readonly eligible_for_creator_scoring?: boolean | null;
}

export interface TransitionCallRow extends TransitionCreatorRow {
  readonly call_id: number;
  readonly call_date: string;
  readonly symbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly extraction_confidence: number;
  readonly specificity_score: number;
  readonly score: number;
  readonly alpha_30d: number | null;
  readonly return_30d: number | null;
  readonly correct_direction: boolean | null;
  readonly price_at_call: number | null;
  readonly price_30d: number | null;
  readonly target_price: number | null;
  readonly price_90d: number | null;
  readonly hit_target: boolean | null;
}

export interface CreatorTransitionSnapshot {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly period: TransitionPeriod;
  readonly period_start: string;
  readonly period_end: string;
  readonly calls_count: number;
  readonly score_ready_calls: number;
  readonly win_rate: number;
  readonly avg_score: number;
  readonly avg_alpha_30d: number;
  readonly avg_return_30d: number;
  readonly bullish_pct: number;
  readonly bearish_pct: number;
  readonly symbol_diversity: number;
  readonly specificity_avg: number;
  readonly extraction_confidence_avg: number;
  readonly score_stddev: number;
  readonly alpha_spread: number;
  readonly latest_call_at: string | null;
  readonly activity_status: "active" | "inactive";
  readonly eligibility_status: "eligible";
  readonly excluded_reason: null;
}

export interface CreatorTransitionExclusion {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly focus: string | null;
  readonly excluded_reason: string;
}

export interface CreatorTransitionStateRecord {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly period_start: string;
  readonly period_end: string;
  readonly state: CreatorTransitionState;
  readonly confidence: number;
  readonly drivers: readonly string[];
  readonly warnings: readonly string[];
  readonly snapshot: CreatorTransitionSnapshot;
}

export interface TransitionBacktestBucket {
  readonly state: CreatorTransitionState;
  readonly observations: number;
  readonly next_periods: number;
  readonly avg_next_win_rate: number;
  readonly avg_next_score: number;
  readonly avg_next_alpha_30d: number;
  readonly future_activity_rate: number;
}

export interface TransitionBacktestReport {
  readonly summary: string;
  readonly buckets: readonly TransitionBacktestBucket[];
}

export interface TransitionReportArtifacts {
  readonly snapshots: readonly CreatorTransitionSnapshot[];
  readonly states: readonly CreatorTransitionStateRecord[];
  readonly backtest: TransitionBacktestReport;
  readonly exclusions: readonly CreatorTransitionExclusion[];
}
