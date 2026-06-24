import type { CreatorTransitionStateRecord } from "../transition/transition-schemas";

export interface StormSupportingCall {
  readonly call_id: number;
  readonly video_id: number | null;
  readonly symbol: string;
  readonly direction: string;
  readonly call_date: string;
  readonly raw_quote: string | null;
  readonly score: number;
  readonly alpha_30d: number | null;
  readonly return_30d: number | null;
  readonly correct_direction: boolean | null;
  readonly extraction_confidence: number;
  readonly source_table: "calls";
}

export interface StormRecentVideo {
  readonly video_id: number;
  readonly youtube_video_id: string | null;
  readonly title: string | null;
  readonly published_at: string | null;
  readonly transcript_available: boolean;
  readonly source_table: "videos";
}

export interface StormQuoteEvidence {
  readonly call_id: number;
  readonly quote: string;
  readonly source_table: "calls";
  readonly confidence: number;
}

export interface StormMarketContext {
  readonly label: string;
  readonly value: string | number | null;
  readonly source_table_or_artifact: string;
}

export interface StormContextSource {
  readonly label: string;
  readonly source_type: "transition_artifact" | "calls" | "videos" | "context_only";
  readonly source_id: string | number;
}

export interface StormEvidencePack {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string | null;
  readonly selected_transition: CreatorTransitionStateRecord;
  readonly state: string;
  readonly confidence: number;
  readonly period_start: string;
  readonly period_end: string;
  readonly movement_drivers: readonly string[];
  readonly supporting_calls: readonly StormSupportingCall[];
  readonly contradicting_calls: readonly StormSupportingCall[];
  readonly recent_videos: readonly StormRecentVideo[];
  readonly quote_evidence: readonly StormQuoteEvidence[];
  readonly market_context: readonly StormMarketContext[];
  readonly context_sources: readonly StormContextSource[];
  readonly warnings: readonly string[];
}

export interface StormClaimMapRecord {
  readonly claim: string;
  readonly claim_type: "transition" | "driver" | "evidence" | "caveat" | "blocked";
  readonly evidence_type: "transition_artifact" | "call" | "quote" | "video" | "none";
  readonly source_table_or_artifact: string;
  readonly source_id: string | number | null;
  readonly confidence: number;
  readonly public_safe: boolean;
  readonly blocked_reason: string | null;
}

export interface StormContradictionRecord {
  readonly contradiction: string;
  readonly source_table_or_artifact: string;
  readonly source_id: string | number | null;
  readonly severity: "low" | "medium" | "high";
  readonly explanation: string;
}

export interface StormYoutubeContext {
  readonly hook_options: readonly string[];
  readonly creator_state: string;
  readonly movement_drivers: readonly string[];
  readonly evidence_bullets: readonly string[];
  readonly safe_claims: readonly string[];
  readonly blocked_claims: readonly string[];
  readonly thumbnail_angles: readonly string[];
  readonly script_context: string;
  readonly risk_notes: readonly string[];
}
