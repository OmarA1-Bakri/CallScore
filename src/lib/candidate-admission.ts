import {
  dedupeGlobalCreatorCandidates,
  getGlobalCreatorCandidates,
  normalizeCreatorHandle,
  type GlobalCreatorCandidateWithSource,
} from "./global-creator-candidates";
import { TRACKED_CREATORS } from "./tracked-creators";

export const CREATOR_CANDIDATE_ADMISSION_JOB_TYPE = "creator_candidate_admission" as const;
export const CANDIDATE_ADMISSION_SCHEMA_VERSION = 1 as const;

export const CANDIDATE_ADMISSION_DECISIONS = [
  "approved",
  "rejected",
  "quarantine",
  "needs_review",
] as const;

export type CandidateAdmissionDecision = (typeof CANDIDATE_ADMISSION_DECISIONS)[number];

export interface CandidateAdmissionPolicy {
  readonly minAutoApproveRelevance: number;
  readonly minNeedsReviewRelevance: number;
  readonly maxRecords: number;
}

export interface CandidateAdmissionRecord {
  readonly schema_version: typeof CANDIDATE_ADMISSION_SCHEMA_VERSION;
  readonly candidate_key: string;
  readonly decision: CandidateAdmissionDecision;
  readonly reasons: readonly string[];
  readonly name: string;
  readonly youtube_handle: string | null;
  readonly youtube_channel_id: string | null;
  readonly source_name: string;
  readonly source_url: string;
  readonly source_snapshot_date: string;
  readonly input_status: GlobalCreatorCandidateWithSource["status"];
  readonly crypto_relevance_score: number;
  readonly rankability_guess: GlobalCreatorCandidateWithSource["rankability_guess"];
  readonly content_type: GlobalCreatorCandidateWithSource["content_type"];
  readonly primary_language: string;
  readonly region: string;
}

export interface CandidateAdmissionMetrics extends Record<string, unknown> {
  readonly schema_version: typeof CANDIDATE_ADMISSION_SCHEMA_VERSION;
  readonly job_type: typeof CREATOR_CANDIDATE_ADMISSION_JOB_TYPE;
  readonly mode: "decision_record_only";
  readonly generated_at: string;
  readonly selected: number;
  readonly max_records: number;
  readonly decision_counts: Record<CandidateAdmissionDecision, number>;
  readonly decisions: readonly CandidateAdmissionRecord[];
  readonly safety: {
    readonly writes_tracked_creators: false;
    readonly mutates_creator_database: false;
    readonly publishes_buyer_facing_rankings: false;
    readonly operator_export_required: true;
  };
}

const DEFAULT_POLICY: CandidateAdmissionPolicy = {
  minAutoApproveRelevance: 0.85,
  minNeedsReviewRelevance: 0.7,
  maxRecords: 50,
};

const QUARANTINE_CONTENT_TYPES = new Set<GlobalCreatorCandidateWithSource["content_type"]>([
  "company_exchange",
  "finance_crypto_adjacent",
]);

const APPROVABLE_CONTENT_TYPES = new Set<GlobalCreatorCandidateWithSource["content_type"]>([
  "creator_calls",
  "creator_news",
  "macro_bitcoin",
]);

interface MinimalPipelineJob {
  readonly payload: Record<string, unknown>;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function parseCandidateAdmissionPolicy(payload: Record<string, unknown> = {}): CandidateAdmissionPolicy {
  return {
    minAutoApproveRelevance: boundedNumber(
      payload.min_auto_approve_relevance,
      DEFAULT_POLICY.minAutoApproveRelevance,
      0,
      1,
    ),
    minNeedsReviewRelevance: boundedNumber(
      payload.min_needs_review_relevance,
      DEFAULT_POLICY.minNeedsReviewRelevance,
      0,
      1,
    ),
    maxRecords: Math.floor(boundedNumber(payload.max_records, DEFAULT_POLICY.maxRecords, 1, 500)),
  };
}

function trackedCreatorKeys(): ReadonlySet<string> {
  return new Set(
    TRACKED_CREATORS
      .map((creator) => normalizeCreatorHandle(creator.youtube_handle))
      .filter((handle): handle is string => Boolean(handle)),
  );
}

export function candidateAdmissionKey(candidate: GlobalCreatorCandidateWithSource): string {
  return (
    normalizeCreatorHandle(candidate.youtube_handle) ??
    candidate.youtube_channel_id?.trim().toLowerCase() ??
    candidate.name.trim().toLowerCase()
  );
}

export function decideCandidateAdmission(
  candidate: GlobalCreatorCandidateWithSource,
  policy: CandidateAdmissionPolicy = DEFAULT_POLICY,
  trackedKeys: ReadonlySet<string> = trackedCreatorKeys(),
): CandidateAdmissionRecord {
  const reasons: string[] = [];
  const normalizedHandle = normalizeCreatorHandle(candidate.youtube_handle);
  let decision: CandidateAdmissionDecision = "needs_review";

  if (normalizedHandle && trackedKeys.has(normalizedHandle)) {
    decision = "rejected";
    reasons.push("already_tracked_creator");
  } else if (candidate.status === "rejected") {
    decision = "rejected";
    reasons.push(candidate.rejection_reason ? "source_rejected_with_reason" : "source_rejected");
  } else if (!normalizedHandle && !candidate.youtube_channel_id) {
    decision = "quarantine";
    reasons.push("missing_youtube_identity");
  } else if (QUARANTINE_CONTENT_TYPES.has(candidate.content_type)) {
    decision = "quarantine";
    reasons.push("adjacent_or_company_channel");
  } else if (candidate.crypto_relevance_score < policy.minNeedsReviewRelevance) {
    decision = "rejected";
    reasons.push("below_relevance_floor");
  } else if (
    (candidate.status === "approved" || candidate.status === "seeded") &&
    candidate.crypto_relevance_score >= policy.minAutoApproveRelevance &&
    candidate.rankability_guess !== "low" &&
    APPROVABLE_CONTENT_TYPES.has(candidate.content_type)
  ) {
    decision = "approved";
    reasons.push("source_status_and_relevance_clear");
  } else {
    decision = "needs_review";
    if (candidate.status === "candidate") reasons.push("source_candidate_not_auto_admitted");
    if (candidate.rankability_guess === "low") reasons.push("low_rankability_guess");
    if (candidate.crypto_relevance_score < policy.minAutoApproveRelevance) reasons.push("below_auto_approve_threshold");
    if (reasons.length === 0) reasons.push("operator_export_review_required");
  }

  return {
    schema_version: CANDIDATE_ADMISSION_SCHEMA_VERSION,
    candidate_key: candidateAdmissionKey(candidate),
    decision,
    reasons,
    name: candidate.name,
    youtube_handle: normalizedHandle,
    youtube_channel_id: candidate.youtube_channel_id ?? null,
    source_name: candidate.source_name,
    source_url: candidate.source_url,
    source_snapshot_date: candidate.source_snapshot_date,
    input_status: candidate.status,
    crypto_relevance_score: candidate.crypto_relevance_score,
    rankability_guess: candidate.rankability_guess,
    content_type: candidate.content_type,
    primary_language: candidate.primary_language,
    region: candidate.region,
  };
}

function decisionSortWeight(decision: CandidateAdmissionDecision): number {
  switch (decision) {
    case "approved":
      return 0;
    case "needs_review":
      return 1;
    case "quarantine":
      return 2;
    case "rejected":
      return 3;
  }
}

export function buildCandidateAdmissionRecords(input: {
  readonly candidates?: readonly GlobalCreatorCandidateWithSource[];
  readonly policy?: Partial<CandidateAdmissionPolicy>;
  readonly trackedKeys?: ReadonlySet<string>;
} = {}): readonly CandidateAdmissionRecord[] {
  const policy = { ...DEFAULT_POLICY, ...input.policy };
  const trackedKeys = input.trackedKeys ?? trackedCreatorKeys();
  return dedupeGlobalCreatorCandidates(input.candidates ?? getGlobalCreatorCandidates())
    .map((candidate) => decideCandidateAdmission(candidate, policy, trackedKeys))
    .sort((a, b) =>
      decisionSortWeight(a.decision) - decisionSortWeight(b.decision) ||
      b.crypto_relevance_score - a.crypto_relevance_score ||
      a.name.localeCompare(b.name),
    )
    .slice(0, policy.maxRecords);
}

export function summarizeCandidateAdmissionRecords(
  records: readonly CandidateAdmissionRecord[],
): Record<CandidateAdmissionDecision, number> {
  const counts: Record<CandidateAdmissionDecision, number> = {
    approved: 0,
    rejected: 0,
    quarantine: 0,
    needs_review: 0,
  };
  for (const record of records) counts[record.decision] += 1;
  return counts;
}

export function runCandidateAdmissionJob(
  job: MinimalPipelineJob,
  now = new Date(),
): CandidateAdmissionMetrics {
  const policy = parseCandidateAdmissionPolicy(job.payload);
  const decisions = buildCandidateAdmissionRecords({ policy });
  return {
    schema_version: CANDIDATE_ADMISSION_SCHEMA_VERSION,
    job_type: CREATOR_CANDIDATE_ADMISSION_JOB_TYPE,
    mode: "decision_record_only",
    generated_at: now.toISOString(),
    selected: decisions.length,
    max_records: policy.maxRecords,
    decision_counts: summarizeCandidateAdmissionRecords(decisions),
    decisions,
    safety: {
      writes_tracked_creators: false,
      mutates_creator_database: false,
      publishes_buyer_facing_rankings: false,
      operator_export_required: true,
    },
  };
}
