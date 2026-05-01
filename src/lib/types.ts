export type Tier = "free" | "pro" | "alpha";
export type LegacyTier = Tier | "elite";
export type Direction = "bullish" | "bearish" | "neutral";
export type CallType = "buy" | "sell" | "hold" | "watch" | "avoid";
export type StrategyType =
  | "technical_analysis"
  | "fundamental"
  | "narrative"
  | "contrarian";
export type Period = "all_time" | "90d" | "30d";

export interface Creator {
  readonly id: number;
  readonly name: string;
  readonly youtube_handle: string;
  readonly youtube_channel_id: string | null;
  readonly subscribers: string | null;
  readonly focus: string | null;
  readonly tier: Tier;
  readonly total_calls: number;
  readonly win_rate: number;
  readonly avg_return: number;
  readonly alpha_score: number;
  readonly accuracy_rank: number | null;
  readonly last_scraped_at: string | null;
  readonly created_at: string;
}

export interface Video {
  readonly id: number;
  readonly creator_id: number;
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly published_at: string | null;
  readonly transcript: string | null;
  readonly transcript_quality: number;
  readonly calls_extracted: boolean;
  readonly extraction_pass: number;
  readonly created_at: string;
}

export interface Call {
  readonly id: number;
  readonly creator_id: number;
  readonly video_id: number;
  readonly symbol: string;
  readonly direction: Direction;
  readonly call_type: string | null;
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
  readonly confidence: string | null;
  readonly strategy_type: string | null;
  readonly raw_quote: string | null;
  readonly extraction_confidence: number;
  readonly specificity_score: number;
  readonly call_date: string;
  readonly price_at_call: number | null;
  readonly btc_price_at_call: number | null;
  readonly price_7d: number | null;
  readonly price_30d: number | null;
  readonly price_90d: number | null;
  readonly btc_price_7d: number | null;
  readonly btc_price_30d: number | null;
  readonly btc_price_90d: number | null;
  readonly return_7d: number | null;
  readonly return_30d: number | null;
  readonly return_90d: number | null;
  readonly alpha_7d: number | null;
  readonly alpha_30d: number | null;
  readonly alpha_90d: number | null;
  readonly hit_target: boolean | null;
  readonly correct_direction: boolean | null;
  readonly regime_at_call: number | null;
  readonly regime_difficulty: number;
  readonly score: number;
  readonly created_at: string;
}

export interface CreatorStats {
  readonly id: number;
  readonly creator_id: number;
  readonly period: Period;
  readonly total_calls: number;
  readonly win_rate: number;
  readonly avg_return_7d: number;
  readonly avg_return_30d: number;
  readonly avg_return_90d: number;
  readonly avg_alpha_30d: number;
  readonly best_call_id: number | null;
  readonly worst_call_id: number | null;
  readonly hit_rate: number;
  readonly most_called_symbol: string | null;
  readonly strategy_consistency: number;
  readonly specificity_avg: number;
  readonly alpha_score: number;
  readonly accuracy_rank: number | null;
  readonly effective_n: number;
  readonly wilson_lb: number;
  readonly bullish_win_rate: number;
  readonly bearish_win_rate: number;
  readonly bullish_pct: number;
  readonly sharpe_ratio: number;
  readonly updated_at: string;
}

export interface ConsensusSignal {
  readonly id: number;
  readonly symbol: string;
  readonly direction: "bullish" | "bearish";
  readonly creator_count: number;
  readonly creator_ids: readonly number[];
  readonly call_ids: readonly number[];
  readonly signal_date: string;
  readonly avg_target_price: number | null;
  readonly price_at_signal: number | null;
  readonly price_7d: number | null;
  readonly price_30d: number | null;
  readonly return_7d: number | null;
  readonly return_30d: number | null;
  readonly correct: boolean | null;
  readonly created_at: string;
}

// AI extraction output shape
export interface ExtractedCall {
  readonly symbol: string;
  readonly direction: Direction;
  readonly call_type: CallType;
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
  readonly confidence: "high" | "medium" | "low";
  readonly strategy_type: StrategyType;
  readonly raw_quote: string;
}

// Leaderboard row for frontend display
export interface LeaderboardRow {
  readonly rank: number;
  readonly creator: Creator;
  readonly stats: CreatorStats;
  readonly best_call: Call | null;
  readonly worst_call: Call | null;
  readonly tier_required: Tier;
  readonly trend: "up" | "down" | "stable";
  // Self-correction index (W3). Optional so consumers that have not yet
  // migrated their row-building code keep compiling; UI treats undefined as
  // the zero-state ("rarely", 0, 0).
  readonly selfCorrectionScore?: number;
  readonly revisionCount?: number;
  readonly selfCorrectionTier?: "honest" | "some" | "rarely";
}
