import { query } from "./db";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallEligibilitySql,
  getScoreReadyIgnoringConfidenceSql,
} from "./public-methodology";

export const DEFAULT_PIPELINE_BLOCKER_LIMIT = 25;
export const MAX_PIPELINE_BLOCKER_LIMIT = 100;

interface CountRow {
  readonly [key: string]: string | number | null;
}

export interface PipelineBlockerOptions {
  readonly limit?: number;
}

export interface PipelineBlockerSnapshot {
  readonly generated_at: string;
  readonly confidence_threshold: number;
  readonly limit: number;
  readonly calls_blocked_by_reason: readonly Record<string, unknown>[];
  readonly calls_blocked_by_symbol: readonly Record<string, unknown>[];
  readonly calls_blocked_by_creator: readonly Record<string, unknown>[];
  readonly calls_blocked_by_pipeline_stage: readonly Record<string, unknown>[];
}

export function normalizePipelineBlockerLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PIPELINE_BLOCKER_LIMIT;
  return Math.min(
    MAX_PIPELINE_BLOCKER_LIMIT,
    Math.max(1, Math.floor(value ?? DEFAULT_PIPELINE_BLOCKER_LIMIT)),
  );
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeRow(row: CountRow): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      key === "calls" ||
      key === "creators" ||
      key === "videos" ||
      key === "public_score_eligible_calls" ||
      key === "score_ready_ignoring_confidence_calls"
    ) {
      output[key] = toNumber(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function callBlockerCaseSql(alias = "c"): string {
  const scoreReady = getScoreReadyIgnoringConfidenceSql(alias);
  return `CASE
    WHEN ${alias}.price_at_call IS NULL THEN 'missing_price_at_call'
    WHEN ${alias}.call_date <= NOW() - INTERVAL '30 days'
      AND (${alias}.price_30d IS NULL OR ${alias}.return_30d IS NULL) THEN 'missing_30d_eval'
    WHEN ${alias}.target_price IS NOT NULL
      AND ${alias}.call_date <= NOW() - INTERVAL '90 days'
      AND (${alias}.price_90d IS NULL OR ${alias}.hit_target IS NULL) THEN 'missing_90d_target_eval'
    WHEN ${alias}.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD}
      AND ${alias}.low_confidence_validation_decision = 'REJECT' THEN 'rejected_low_confidence_validator'
    WHEN ${alias}.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD}
      AND ${alias}.low_confidence_validation_decision = 'NEEDS_HUMAN_REVIEW' THEN 'needs_human_review_low_confidence'
    WHEN ${alias}.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD}
      AND (${scoreReady}) THEN 'low_confidence_score_ready_unvalidated'
    WHEN ${alias}.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD} THEN 'low_confidence_structurally_pending'
    WHEN ${alias}.call_date > NOW() - INTERVAL '30 days' THEN 'awaiting_30d_horizon'
    WHEN ${alias}.target_price IS NOT NULL
      AND ${alias}.call_date > NOW() - INTERVAL '90 days' THEN 'awaiting_90d_target_horizon'
    ELSE 'other_not_public'
  END`;
}

export function pipelineStageCaseSql(blockerAlias = "blocker"): string {
  return `CASE
    WHEN ${blockerAlias} IN (
      'low_confidence_score_ready_unvalidated',
      'low_confidence_structurally_pending',
      'needs_human_review_low_confidence',
      'rejected_low_confidence_validator'
    ) THEN 'validation'
    WHEN ${blockerAlias} = 'missing_price_at_call' THEN 'pricing'
    WHEN ${blockerAlias} IN (
      'missing_30d_eval',
      'missing_90d_target_eval',
      'awaiting_30d_horizon',
      'awaiting_90d_target_horizon'
    ) THEN 'evaluation'
    ELSE 'other'
  END`;
}

function blockedCallsCte(): string {
  const publicEligible = getCallEligibilitySql("c");
  const blockerCase = callBlockerCaseSql("c");
  return `WITH blocked AS (
    SELECT
      c.id,
      c.symbol,
      c.creator_id,
      c.video_id,
      c.extraction_confidence,
      ${blockerCase} AS blocker
    FROM calls c
    WHERE NOT (${publicEligible})
  )`;
}

export function callsBlockedByReasonSql(): string {
  return `${blockedCallsCte()}
    SELECT
      blocker,
      ${pipelineStageCaseSql("blocker")} AS pipeline_stage,
      COUNT(*)::text AS calls,
      COUNT(DISTINCT creator_id)::text AS creators,
      COUNT(DISTINCT video_id)::text AS videos
    FROM blocked
    GROUP BY blocker, pipeline_stage
    ORDER BY COUNT(*) DESC, blocker ASC`;
}

export function callsBlockedBySymbolSql(): string {
  return `${blockedCallsCte()}
    SELECT
      symbol,
      blocker,
      ${pipelineStageCaseSql("blocker")} AS pipeline_stage,
      COUNT(*)::text AS calls,
      COUNT(DISTINCT creator_id)::text AS creators,
      COUNT(DISTINCT video_id)::text AS videos
    FROM blocked
    GROUP BY symbol, blocker, pipeline_stage
    ORDER BY COUNT(*) DESC, symbol ASC, blocker ASC
    LIMIT $1`;
}

export function callsBlockedByCreatorSql(): string {
  return `${blockedCallsCte()}
    SELECT
      cr.id::text AS creator_id,
      cr.name,
      cr.youtube_handle,
      blocked.blocker,
      ${pipelineStageCaseSql("blocked.blocker")} AS pipeline_stage,
      COUNT(*)::text AS calls,
      COUNT(DISTINCT blocked.video_id)::text AS videos
    FROM blocked
    JOIN creators cr ON cr.id = blocked.creator_id
    GROUP BY cr.id, cr.name, cr.youtube_handle, blocked.blocker, pipeline_stage
    ORDER BY COUNT(*) DESC, cr.name ASC, blocked.blocker ASC
    LIMIT $1`;
}

export function callsBlockedByPipelineStageSql(): string {
  return `${blockedCallsCte()}
    SELECT
      ${pipelineStageCaseSql("blocker")} AS pipeline_stage,
      blocker,
      COUNT(*)::text AS calls,
      COUNT(DISTINCT creator_id)::text AS creators,
      COUNT(DISTINCT video_id)::text AS videos
    FROM blocked
    GROUP BY pipeline_stage, blocker
    ORDER BY COUNT(*) DESC, pipeline_stage ASC, blocker ASC`;
}

export async function getPipelineBlockerSnapshot(
  options: PipelineBlockerOptions = {},
): Promise<PipelineBlockerSnapshot> {
  const limit = normalizePipelineBlockerLimit(options.limit);
  const [byReason, bySymbol, byCreator, byStage] = await Promise.all([
    query<CountRow>(callsBlockedByReasonSql()),
    query<CountRow>(callsBlockedBySymbolSql(), [limit]),
    query<CountRow>(callsBlockedByCreatorSql(), [limit]),
    query<CountRow>(callsBlockedByPipelineStageSql()),
  ]);

  return {
    generated_at: new Date().toISOString(),
    confidence_threshold: EXTRACTION_CONFIDENCE_THRESHOLD,
    limit,
    calls_blocked_by_reason: byReason.map(normalizeRow),
    calls_blocked_by_symbol: bySymbol.map(normalizeRow),
    calls_blocked_by_creator: byCreator.map(normalizeRow),
    calls_blocked_by_pipeline_stage: byStage.map(normalizeRow),
  };
}
