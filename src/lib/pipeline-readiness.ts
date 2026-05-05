import type { PublicCounts } from "./public-counts";
import type { ShadowDiffRecord, ShadowExtractedCallRecord } from "./shadow-extraction";

export interface CreatorCompletenessInput {
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly total_videos: number;
  readonly published_videos: number;
  readonly transcript_videos: number;
  readonly extraction_eligible_videos: number;
  readonly missing_transcript_videos: number;
  readonly low_quality_transcript_videos: number;
  readonly production_calls: number;
}

export interface TerminalVideoAuditRecord {
  readonly record_type?: string;
  readonly status?: string;
  readonly video_id?: number;
  readonly video?: { readonly id?: number };
  readonly creator_id?: number;
}

export type CreatorCompletenessStatus =
  | "no_videos"
  | "missing_publication_dates"
  | "missing_transcripts"
  | "pending_shadow"
  | "shadow_complete";

export interface CreatorCompletenessSummary extends CreatorCompletenessInput {
  readonly shadow_videos: number;
  readonly promoted_videos: number;
  readonly terminal_publication_date_videos: number;
  readonly terminal_transcript_videos: number;
  readonly status: CreatorCompletenessStatus;
}

export interface ShadowArtifactSummary {
  readonly extractionRecords: number;
  readonly shadowVideos: number;
  readonly acceptedCalls: number;
  readonly failedExtractions: number;
  readonly diffRecords: number;
  readonly diffStatuses: Record<string, number>;
}

export interface PromotionAuditSummary {
  readonly records: number;
  readonly dryRunPromotions: number;
  readonly writtenPromotions: number;
  readonly skipped: number;
  readonly promotedVideos: number;
}

export interface PipelineReadinessSummary {
  readonly generated_at: string;
  readonly publicCounts: PublicCounts;
  readonly creatorCompleteness: {
    readonly creators: number;
    readonly byStatus: Record<CreatorCompletenessStatus, number>;
    readonly incomplete: number;
    readonly rows: readonly CreatorCompletenessSummary[];
  };
  readonly funnel: {
    readonly trackedCalls: number;
    readonly shadowAcceptedCalls: number;
    readonly promotedVideos: number;
    readonly llmValidatedCalls: number;
    readonly publicScoredCalls: number;
    readonly pendingHorizonCalls: number;
    readonly missingPriceCalls: number;
    readonly missing30dCalls: number;
    readonly targetPendingCalls: number;
    readonly excludedLowConfidenceCalls: number;
  };
  readonly shadow: ShadowArtifactSummary;
  readonly promotion: PromotionAuditSummary;
  readonly terminalCoverage: {
    readonly publicationDateVideos: number;
    readonly transcriptVideos: number;
  };
  readonly blockers: readonly string[];
}

interface PromotionAuditRecord {
  readonly record_type?: string;
  readonly phase?: string;
  readonly action?: string;
  readonly video?: { readonly id?: number; readonly creator_id?: number };
}

const CREATOR_STATUSES: readonly CreatorCompletenessStatus[] = [
  "no_videos",
  "missing_publication_dates",
  "missing_transcripts",
  "pending_shadow",
  "shadow_complete",
];

export function summarizeShadowArtifacts(
  extractionRecords: readonly ShadowExtractedCallRecord[],
  diffRecords: readonly ShadowDiffRecord[] = [],
): ShadowArtifactSummary {
  const shadowVideos = new Set(extractionRecords.map((record) => record.video.id));
  const diffStatuses: Record<string, number> = {};
  for (const record of diffRecords) {
    diffStatuses[record.status] = (diffStatuses[record.status] ?? 0) + 1;
  }
  return {
    extractionRecords: extractionRecords.length,
    shadowVideos: shadowVideos.size,
    acceptedCalls: extractionRecords.reduce((sum, record) => sum + record.accepted_calls.length, 0),
    failedExtractions: extractionRecords.filter((record) => record.error && record.error !== "dry_run_no_model_call").length,
    diffRecords: diffRecords.length,
    diffStatuses,
  };
}

export function summarizePromotionAudit(records: readonly PromotionAuditRecord[]): PromotionAuditSummary {
  const promotedVideoIds = new Set<number>();
  let dryRunPromotions = 0;
  let writtenPromotions = 0;
  let skipped = 0;

  for (const record of records) {
    if (record.action === "skip") skipped++;
    if (record.action === "promote" && record.phase === "dry_run") dryRunPromotions++;
    if (record.action === "promote" && record.phase === "after_write") {
      writtenPromotions++;
      if (typeof record.video?.id === "number") promotedVideoIds.add(record.video.id);
    }
  }

  return {
    records: records.length,
    dryRunPromotions,
    writtenPromotions,
    skipped,
    promotedVideos: promotedVideoIds.size,
  };
}

function statusForCreator(row: CreatorCompletenessInput, shadowVideos: number): CreatorCompletenessStatus {
  if (row.total_videos === 0) return "no_videos";
  if (row.published_videos < row.total_videos) return "missing_publication_dates";
  if (row.missing_transcript_videos > 0 || row.low_quality_transcript_videos > 0) return "missing_transcripts";
  if (shadowVideos < row.extraction_eligible_videos) return "pending_shadow";
  return "shadow_complete";
}

function terminalRecordVideoId(record: TerminalVideoAuditRecord): number | null {
  if (typeof record.video_id === "number") return record.video_id;
  if (typeof record.video?.id === "number") return record.video.id;
  return null;
}

function terminalVideoIds(records: readonly TerminalVideoAuditRecord[], acceptedStatuses: readonly string[]): Set<number> {
  const accepted = new Set(acceptedStatuses);
  const ids = new Set<number>();
  for (const record of records) {
    if (!record.status || !accepted.has(record.status)) continue;
    const id = terminalRecordVideoId(record);
    if (id != null) ids.add(id);
  }
  return ids;
}

function terminalByCreator(records: readonly TerminalVideoAuditRecord[], acceptedStatuses: readonly string[]): Map<number, Set<number>> {
  const accepted = new Set(acceptedStatuses);
  const byCreator = new Map<number, Set<number>>();
  for (const record of records) {
    if (!record.status || !accepted.has(record.status)) continue;
    if (typeof record.creator_id !== "number") continue;
    const videoId = terminalRecordVideoId(record);
    if (videoId == null) continue;
    const bucket = byCreator.get(record.creator_id) ?? new Set<number>();
    bucket.add(videoId);
    byCreator.set(record.creator_id, bucket);
  }
  return byCreator;
}

export function summarizeCreatorCompleteness(
  rows: readonly CreatorCompletenessInput[],
  extractionRecords: readonly ShadowExtractedCallRecord[],
  promotionRecords: readonly PromotionAuditRecord[],
  terminalPublicationDateRecords: readonly TerminalVideoAuditRecord[] = [],
  terminalTranscriptRecords: readonly TerminalVideoAuditRecord[] = [],
): PipelineReadinessSummary["creatorCompleteness"] {
  const shadowByCreator = new Map<number, Set<number>>();
  for (const record of extractionRecords) {
    const bucket = shadowByCreator.get(record.video.creator_id) ?? new Set<number>();
    bucket.add(record.video.id);
    shadowByCreator.set(record.video.creator_id, bucket);
  }

  const promotedByCreator = new Map<number, Set<number>>();
  for (const record of promotionRecords) {
    if (record.phase !== "after_write" || record.action !== "promote") continue;
    const creatorId = record.video?.creator_id;
    const videoId = record.video?.id;
    if (typeof creatorId !== "number" || typeof videoId !== "number") continue;
    const bucket = promotedByCreator.get(creatorId) ?? new Set<number>();
    bucket.add(videoId);
    promotedByCreator.set(creatorId, bucket);
  }

  const terminalDatesByCreator = terminalByCreator(terminalPublicationDateRecords, ["missing_date", "terminal_missing_date"]);
  const terminalTranscriptsByCreator = terminalByCreator(terminalTranscriptRecords, ["terminal_no_transcript", "terminal_transcript_unavailable"]);

  const byStatus = Object.fromEntries(CREATOR_STATUSES.map((status) => [status, 0])) as Record<CreatorCompletenessStatus, number>;
  const summaries = rows.map((row) => {
    const shadowVideos = shadowByCreator.get(row.creator_id)?.size ?? 0;
    const terminalPublicationDateVideos = terminalDatesByCreator.get(row.creator_id)?.size ?? 0;
    const terminalTranscriptVideos = terminalTranscriptsByCreator.get(row.creator_id)?.size ?? 0;
    const effectiveRow = {
      ...row,
      published_videos: Math.min(row.total_videos, row.published_videos + terminalPublicationDateVideos),
      missing_transcript_videos: Math.max(0, row.missing_transcript_videos - terminalTranscriptVideos),
    };
    const status = statusForCreator(effectiveRow, shadowVideos);
    byStatus[status]++;
    return {
      ...row,
      shadow_videos: shadowVideos,
      promoted_videos: promotedByCreator.get(row.creator_id)?.size ?? 0,
      terminal_publication_date_videos: terminalPublicationDateVideos,
      terminal_transcript_videos: terminalTranscriptVideos,
      status,
    };
  });

  return {
    creators: summaries.length,
    byStatus,
    incomplete: summaries.filter((row) => row.status !== "shadow_complete").length,
    rows: summaries,
  };
}

export function buildPipelineReadinessSummary(input: {
  readonly generatedAt: string;
  readonly publicCounts: PublicCounts;
  readonly creators: readonly CreatorCompletenessInput[];
  readonly extractionRecords: readonly ShadowExtractedCallRecord[];
  readonly diffRecords: readonly ShadowDiffRecord[];
  readonly promotionRecords: readonly PromotionAuditRecord[];
  readonly terminalPublicationDateRecords?: readonly TerminalVideoAuditRecord[];
  readonly terminalTranscriptRecords?: readonly TerminalVideoAuditRecord[];
  readonly requireFullShadowRecheck?: boolean;
}): PipelineReadinessSummary {
  const shadow = summarizeShadowArtifacts(input.extractionRecords, input.diffRecords);
  const promotion = summarizePromotionAudit(input.promotionRecords);
  const terminalPublicationDateRecords = input.terminalPublicationDateRecords ?? [];
  const terminalTranscriptRecords = input.terminalTranscriptRecords ?? [];
  const creatorCompleteness = summarizeCreatorCompleteness(
    input.creators,
    input.extractionRecords,
    input.promotionRecords,
    terminalPublicationDateRecords,
    terminalTranscriptRecords,
  );
  const blockers: string[] = [];

  if (shadow.failedExtractions > 0) blockers.push("shadow_failed_extractions");
  if (creatorCompleteness.byStatus.missing_publication_dates > 0) blockers.push("missing_publication_dates");
  if (creatorCompleteness.byStatus.missing_transcripts > 0) blockers.push("missing_transcripts_or_terminal_reasons");
  if (input.requireFullShadowRecheck !== false && creatorCompleteness.byStatus.pending_shadow > 0) {
    blockers.push("pending_shadow_recheck");
  }

  return {
    generated_at: input.generatedAt,
    publicCounts: input.publicCounts,
    creatorCompleteness,
    funnel: {
      trackedCalls: input.publicCounts.trackedCalls,
      shadowAcceptedCalls: shadow.acceptedCalls,
      promotedVideos: promotion.promotedVideos,
      llmValidatedCalls: input.publicCounts.llmValidatedCalls,
      publicScoredCalls: input.publicCounts.publicScoredCalls,
      pendingHorizonCalls: input.publicCounts.pendingHorizonCalls,
      missingPriceCalls: input.publicCounts.missingPriceCalls,
      missing30dCalls: input.publicCounts.missing30dCalls,
      targetPendingCalls: input.publicCounts.targetPendingCalls,
      excludedLowConfidenceCalls: input.publicCounts.excludedLowConfidenceCalls,
    },
    shadow,
    promotion,
    terminalCoverage: {
      publicationDateVideos: terminalVideoIds(terminalPublicationDateRecords, ["missing_date", "terminal_missing_date"]).size,
      transcriptVideos: terminalVideoIds(terminalTranscriptRecords, ["terminal_no_transcript", "terminal_transcript_unavailable"]).size,
    },
    blockers,
  };
}
