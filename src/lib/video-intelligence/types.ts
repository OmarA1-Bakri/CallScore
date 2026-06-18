import type { JsonRecord } from "../control-plane";

export interface VideoIntelligenceInput {
  readonly videoId: string;
  readonly title: string;
  readonly creatorHandle?: string;
  readonly publishedAt?: string;
  readonly transcript: string;
}

export interface TranscriptSegment {
  readonly id: string;
  readonly index: number;
  readonly startChar: number;
  readonly endChar: number;
  readonly text: string;
}

export type CandidateCallStatus =
  | "accepted_call"
  | "rejected_non_call"
  | "rejected_not_creator_owned"
  | "rejected_news_or_aggregation"
  | "rejected_ambiguous"
  | "rejected_unsupported_asset";

export type CallDirection = "bullish" | "bearish" | "neutral";

export interface CandidateCall {
  readonly id: string;
  readonly segmentId: string;
  readonly quote: string;
  readonly status: CandidateCallStatus;
  readonly assetSymbol: string | null;
  readonly direction: CallDirection | null;
  readonly thesis: string | null;
  readonly timeframe: string | null;
  readonly target: string | null;
  readonly stopLossOrInvalidation: string | null;
  readonly isCreatorOwned: boolean;
  readonly confidence: number;
  readonly rejectionReason: string | null;
}

export interface NormalizedCall {
  readonly id: string;
  readonly candidateCallId: string;
  readonly status: CandidateCallStatus;
  readonly assetSymbol: string | null;
  readonly marketSymbol: string | null;
  readonly direction: CallDirection | null;
  readonly thesis: string | null;
  readonly timeframe: string | null;
  readonly target: string | null;
  readonly stopLossOrInvalidation: string | null;
  readonly evidenceSegmentId: string;
  readonly evidenceQuote: string;
  readonly confidence: number;
  readonly requiresApproval: boolean;
  readonly rejectionReason: string | null;
}

export interface EvidenceValidationIssue {
  readonly code: string;
  readonly callId?: string;
  readonly segmentId?: string;
  readonly message: string;
}

export interface EvidenceValidationReport {
  readonly valid: boolean;
  readonly requiresApproval: boolean;
  readonly acceptedCallCount: number;
  readonly issues: readonly EvidenceValidationIssue[];
  readonly metadata: JsonRecord;
}
