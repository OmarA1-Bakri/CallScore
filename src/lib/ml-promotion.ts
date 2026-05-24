import { query as defaultQuery } from "./db";
import { ML_VERIFIER_PROMPT_VERSION } from "./ml-verifier";
import type { PipelineJob } from "./pipeline";
import { EXTRACTION_CONFIDENCE_THRESHOLD } from "./public-methodology";

export const PROMOTE_ML_VERIFIED_JOB_TYPE = "promote_ml_verified";
export const DEFAULT_ML_PROMOTION_LIMIT = 100;
export const DEFAULT_MIN_VERIFIER_CONFIDENCE = 0.85;

type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;
type PromotionStatus = "blocked" | "dry_run" | "running" | "succeeded" | "failed";

interface MlPromotionCandidate {
  readonly call_id: number;
  readonly current_extraction_confidence: number;
  readonly recommended_extraction_confidence: number;
  readonly verifier_confidence: number;
  readonly verification_run_id: number;
}

interface MlPromotionArgs {
  readonly write: boolean;
  readonly promptVersion: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly limit: number;
  readonly minVerifierConfidence: number;
  readonly manualReviewApproved: boolean;
  readonly manualReviewedBy: string | null;
  readonly manualReviewTicket: string | null;
  readonly shadowDiffPassed: boolean;
  readonly shadowDiffSummary: Record<string, unknown>;
  readonly goldSetPassed: boolean;
  readonly goldSetMetrics: Record<string, unknown>;
}

export interface MlPromotionGateResults {
  readonly enabled: boolean;
  readonly manual_review: boolean;
  readonly shadow_diff: boolean;
  readonly gold_set: boolean;
  readonly preserves_public_confidence_threshold: true;
  readonly passed: boolean;
  readonly blockers: readonly string[];
}

export interface MlPromotionGateInput {
  readonly manualReviewApproved: boolean;
  readonly manualReviewedBy: string | null;
  readonly manualReviewTicket: string | null;
  readonly shadowDiffPassed: boolean;
  readonly goldSetPassed: boolean;
}

export interface MlPromotionMetrics extends Record<string, unknown> {
  readonly selected: number;
  readonly promoted: number;
  readonly dry_run: boolean;
  readonly write_requested: boolean;
  readonly gate_passed: boolean;
  readonly blockers: readonly string[];
  readonly prompt_version: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly threshold: number;
  readonly min_verifier_confidence: number;
}

interface RunPromotionDeps {
  readonly queryFn?: QueryFn;
  readonly env?: Record<string, string | undefined>;
}

interface AuditRow {
  readonly id: number;
}

interface PromotionResultRow {
  readonly promoted_count: number;
  readonly promoted_call_ids: readonly number[] | null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? Math.floor(parsed) : fallback;
}

function zeroToOne(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function parsePromotionArgs(payload: Record<string, unknown>): MlPromotionArgs {
  return {
    write: payload.write === true,
    promptVersion: stringValue(payload.prompt_version) ?? ML_VERIFIER_PROMPT_VERSION,
    provider: stringValue(payload.provider),
    model: stringValue(payload.model),
    limit: Math.min(1000, positiveInt(payload.limit, DEFAULT_ML_PROMOTION_LIMIT)),
    minVerifierConfidence: zeroToOne(payload.min_verifier_confidence, DEFAULT_MIN_VERIFIER_CONFIDENCE),
    manualReviewApproved: payload.manual_review_approved === true,
    manualReviewedBy: stringValue(payload.manual_reviewed_by),
    manualReviewTicket: stringValue(payload.manual_review_ticket),
    shadowDiffPassed: payload.shadow_diff_passed === true,
    shadowDiffSummary: objectValue(payload.shadow_diff_summary),
    goldSetPassed: payload.gold_set_passed === true,
    goldSetMetrics: objectValue(payload.gold_set_metrics),
  };
}

export function validateMlPromotionGates(
  args: MlPromotionGateInput,
  env: Record<string, string | undefined> = process.env,
): MlPromotionGateResults {
  const enabled = env.ML_PROMOTION_ENABLED === "true";
  const manualReview = Boolean(args.manualReviewApproved && args.manualReviewedBy && args.manualReviewTicket);
  const blockers: string[] = [];

  if (!enabled) blockers.push("ml_promotion_disabled");
  if (!manualReview) blockers.push("manual_review_required");
  if (!args.shadowDiffPassed) blockers.push("shadow_diff_required");
  if (!args.goldSetPassed) blockers.push("gold_set_required");

  return {
    enabled,
    manual_review: manualReview,
    shadow_diff: args.shadowDiffPassed,
    gold_set: args.goldSetPassed,
    preserves_public_confidence_threshold: true,
    passed: blockers.length === 0,
    blockers,
  };
}

export function buildMlPromotionCandidateSql(): string {
  return `WITH latest_verification AS (
    SELECT DISTINCT ON (call_id)
      id AS verification_run_id,
      call_id,
      confidence AS verifier_confidence,
      recommended_extraction_confidence,
      created_at
    FROM ml_verification_runs
    WHERE decision = 'approve'
      AND prompt_version = $1
      AND confidence >= $2
      AND recommended_extraction_confidence >= $3
      AND ($5::text IS NULL OR provider = $5)
      AND ($6::text IS NULL OR model = $6)
    ORDER BY call_id, created_at DESC, id DESC
  )
  SELECT
    c.id AS call_id,
    c.extraction_confidence AS current_extraction_confidence,
    latest_verification.recommended_extraction_confidence,
    latest_verification.verifier_confidence,
    latest_verification.verification_run_id
  FROM latest_verification
  JOIN calls c ON c.id = latest_verification.call_id
  WHERE c.extraction_confidence < $3
  ORDER BY latest_verification.created_at DESC, c.id ASC
  LIMIT $4`;
}

async function selectPromotionCandidates(args: MlPromotionArgs, queryFn: QueryFn): Promise<MlPromotionCandidate[]> {
  return queryFn<MlPromotionCandidate>(
    buildMlPromotionCandidateSql(),
    [
      args.promptVersion,
      args.minVerifierConfidence,
      EXTRACTION_CONFIDENCE_THRESHOLD,
      args.limit,
      args.provider,
      args.model,
    ],
  );
}

async function writePromotionEvent(
  job: PipelineJob,
  eventType: string,
  status: string,
  message: string,
  payload: Record<string, unknown>,
  queryFn: QueryFn,
): Promise<void> {
  await queryFn(
    `INSERT INTO pipeline_job_events (
       run_id, job_id, event_type, status, message, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [job.run_id, job.id, eventType, status, message, JSON.stringify(payload)],
  );
}

async function insertAuditStart(input: {
  readonly job: PipelineJob;
  readonly args: MlPromotionArgs;
  readonly gates: MlPromotionGateResults;
  readonly candidates: readonly MlPromotionCandidate[];
  readonly status: PromotionStatus;
  readonly queryFn: QueryFn;
}): Promise<number> {
  const [row] = await input.queryFn<AuditRow>(
    `INSERT INTO ml_promotion_audit (
       run_id,
       job_id,
       prompt_version,
       provider,
       model,
       dry_run,
       write_requested,
       gate_passed,
       status,
       manual_reviewed_by,
       manual_review_ticket,
       shadow_diff_summary,
       gold_set_metrics,
       candidate_call_ids,
       gate_results
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12::jsonb, $13::jsonb, $14::integer[], $15::jsonb
     )
     RETURNING id`,
    [
      input.job.run_id,
      input.job.id,
      input.args.promptVersion,
      input.args.provider,
      input.args.model,
      !input.args.write,
      input.args.write,
      input.gates.passed,
      input.status,
      input.args.manualReviewedBy,
      input.args.manualReviewTicket,
      JSON.stringify(input.args.shadowDiffSummary),
      JSON.stringify(input.args.goldSetMetrics),
      input.candidates.map((candidate) => candidate.call_id),
      JSON.stringify(input.gates),
    ],
  );
  if (!row) throw new Error("Failed to write ML promotion audit row");
  return Number(row.id);
}

async function updateAudit(input: {
  readonly auditId: number;
  readonly status: PromotionStatus;
  readonly promotedCallIds?: readonly number[];
  readonly error?: string;
  readonly queryFn: QueryFn;
}): Promise<void> {
  const promotedCallIds = input.promotedCallIds ?? [];
  await input.queryFn(
    `UPDATE ml_promotion_audit
     SET status = $2,
         promoted_call_ids = $3::integer[],
         error = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [input.auditId, input.status, promotedCallIds, input.error ?? null],
  );
}

async function promoteCandidates(input: {
  readonly args: MlPromotionArgs;
  readonly candidates: readonly MlPromotionCandidate[];
  readonly queryFn: QueryFn;
}): Promise<readonly number[]> {
  if (input.candidates.length === 0) return [];
  const [row] = await input.queryFn<PromotionResultRow>(
    `WITH selected(call_id) AS (
       SELECT UNNEST($1::integer[])
     ),
     latest_verification AS (
       SELECT DISTINCT ON (runs.call_id)
         runs.call_id,
         runs.recommended_extraction_confidence
       FROM ml_verification_runs runs
       JOIN selected ON selected.call_id = runs.call_id
       WHERE runs.decision = 'approve'
         AND runs.prompt_version = $2
         AND runs.confidence >= $3
         AND runs.recommended_extraction_confidence >= $4
         AND ($5::text IS NULL OR runs.provider = $5)
         AND ($6::text IS NULL OR runs.model = $6)
       ORDER BY runs.call_id, runs.created_at DESC, runs.id DESC
     ),
     updated AS (
       UPDATE calls c
       SET extraction_confidence = GREATEST(
         c.extraction_confidence,
         LEAST(1, latest_verification.recommended_extraction_confidence),
         $4
       )
       FROM latest_verification
       WHERE c.id = latest_verification.call_id
         AND c.extraction_confidence < $4
       RETURNING c.id
     )
     SELECT
       COUNT(*)::int AS promoted_count,
       COALESCE(ARRAY_AGG(id ORDER BY id), '{}'::integer[]) AS promoted_call_ids
     FROM updated`,
    [
      input.candidates.map((candidate) => candidate.call_id),
      input.args.promptVersion,
      input.args.minVerifierConfidence,
      EXTRACTION_CONFIDENCE_THRESHOLD,
      input.args.provider,
      input.args.model,
    ],
  );
  return row?.promoted_call_ids ?? [];
}

export async function runMlPromotionJob(
  job: PipelineJob,
  deps: RunPromotionDeps = {},
): Promise<MlPromotionMetrics> {
  const queryFn = deps.queryFn ?? defaultQuery;
  const args = parsePromotionArgs(job.payload);
  const gates = validateMlPromotionGates(args, deps.env ?? process.env);
  const candidates = await selectPromotionCandidates(args, queryFn);
  const initialStatus: PromotionStatus = args.write ? (gates.passed ? "running" : "blocked") : "dry_run";
  const auditId = await insertAuditStart({ job, args, gates, candidates, status: initialStatus, queryFn });

  const baseMetrics = {
    selected: candidates.length,
    dry_run: !args.write,
    write_requested: args.write,
    gate_passed: gates.passed,
    blockers: gates.blockers,
    prompt_version: args.promptVersion,
    provider: args.provider,
    model: args.model,
    threshold: EXTRACTION_CONFIDENCE_THRESHOLD,
    min_verifier_confidence: args.minVerifierConfidence,
  } satisfies Omit<MlPromotionMetrics, "promoted">;

  if (!args.write) {
    await writePromotionEvent(
      job,
      "ml_promotion_dry_run",
      "succeeded",
      "ML promotion dry-run completed",
      {
        ...baseMetrics,
        audit_id: auditId,
        candidate_call_ids: candidates.map((candidate) => candidate.call_id),
      },
      queryFn,
    );
    return { ...baseMetrics, promoted: 0 };
  }

  if (!gates.passed) {
    const message = `ML promotion gates failed: ${gates.blockers.join(", ")}`;
    await updateAudit({ auditId, status: "blocked", error: message, queryFn });
    await writePromotionEvent(
      job,
      "ml_promotion_blocked",
      "blocked",
      message,
      {
        ...baseMetrics,
        audit_id: auditId,
      },
      queryFn,
    );
    throw new Error(message);
  }

  try {
    const promotedCallIds = await promoteCandidates({ args, candidates, queryFn });
    await updateAudit({ auditId, status: "succeeded", promotedCallIds, queryFn });
    await writePromotionEvent(
      job,
      "ml_promotion_completed",
      "succeeded",
      "ML promotion completed",
      {
        ...baseMetrics,
        promoted: promotedCallIds.length,
        audit_id: auditId,
        promoted_call_ids: promotedCallIds,
      },
      queryFn,
    );

    return { ...baseMetrics, promoted: promotedCallIds.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAudit({ auditId, status: "failed", error: message, queryFn });
    await writePromotionEvent(
      job,
      "ml_promotion_completed",
      "failed",
      "ML promotion failed",
      {
        ...baseMetrics,
        promoted: 0,
        audit_id: auditId,
        error: message,
      },
      queryFn,
    );
    throw error;
  }
}
