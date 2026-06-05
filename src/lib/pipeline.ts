import { throwIfCronDeadlineExceeded } from "@/app/api/cron/deadline";
import { TRACKED_SYMBOLS } from "./constants";
import { query } from "./db";
import { createHash } from "node:crypto";

export const RALPLAN_PHASES = [
  "phase1-stabilize",
  "phase2-pipeline",
  "phase3-whop-scaffold",
  "phase4-commerce",
  "phase5-marketing",
] as const;

export type RalplanPhase = (typeof RALPLAN_PHASES)[number];

export const DEFAULT_PHASE: RalplanPhase = "phase2-pipeline";

export type PipelineRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type PipelineJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface PipelineRun {
  readonly id: number;
  readonly run_key: string;
  readonly type: string;
  readonly status: PipelineRunStatus;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly metrics: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PipelineJob {
  readonly id: number;
  readonly run_id: number | null;
  readonly type: string;
  readonly status: PipelineJobStatus;
  readonly priority: number;
  readonly payload: Record<string, unknown>;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly locked_by: string | null;
  readonly locked_at: string | null;
  readonly heartbeat_at: string | null;
  readonly lease_expires_at: string | null;
  readonly run_after: string;
  readonly idempotency_key: string | null;
  readonly error: string | null;
  readonly metrics: Record<string, unknown>;
  readonly phase: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PipelineJobEvent {
  readonly id: number;
  readonly run_id: number | null;
  readonly job_id: number | null;
  readonly event_type: string;
  readonly status: string | null;
  readonly message: string | null;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
}

export interface PipelineStuckJob extends PipelineJob {
  readonly stuck_seconds: number;
}

export interface CandleFreshness {
  readonly symbol: string;
  readonly candle_count: number;
  readonly latest_open_time_ms: string | null;
  readonly latest_candle_at: string | null;
  readonly staleness_seconds: number | null;
  readonly status: "fresh" | "stale" | "missing";
}

interface EnqueueJobInput {
  readonly runKey: string;
  readonly runType: string;
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  readonly priority?: number;
  readonly idempotencyKey: string;
  readonly maxAttempts?: number;
  readonly phase?: string;
  readonly signal?: AbortSignal;
}

interface ClaimNextJobInput {
  readonly workerId: string;
  readonly types: readonly string[];
}

export interface PipelineStatusSnapshot {
  readonly runs: readonly PipelineRun[];
  readonly jobs: readonly PipelineJob[];
  readonly events: readonly PipelineJobEvent[];
  readonly stuck_jobs: readonly PipelineStuckJob[];
  readonly candle_freshness: readonly CandleFreshness[];
}

const DEFAULT_ML_BATCH_SIZE = 250;
const DEFAULT_MATCH_PRICES_LIMIT = 1000;
const DEFAULT_MATCH_PRICES_BATCH_SIZE = 200;
const DEFAULT_STUCK_JOB_SECONDS = 30 * 60;
export const DEFAULT_PIPELINE_JOB_LEASE_SECONDS = 10 * 60;
const FRESH_CANDLE_SECONDS = 2 * 60 * 60;
const CANDLE_FRESHNESS_SYMBOLS = Array.from(new Set([...TRACKED_SYMBOLS, "XLMUSDT"]));

function asJsonbParam(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function readPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return {};
}

function normalizeJob(row: PipelineJob): PipelineJob {
  return { ...row, payload: readPayload(row.payload), metrics: readPayload(row.metrics) };
}

function normalizeRun(row: PipelineRun): PipelineRun {
  return { ...row, metrics: readPayload(row.metrics) };
}

function normalizeEvent(row: PipelineJobEvent): PipelineJobEvent {
  return { ...row, payload: readPayload(row.payload) };
}

export function nightlyMlVerifierRunKey(now = new Date()): string {
  return `nightly-ml-verifier:${now.toISOString().slice(0, 10)}`;
}

function dailyRunKey(prefix: string, now = new Date()): string {
  return `${prefix}:${now.toISOString().slice(0, 10)}`;
}

export function candleRefreshRunKey(now = new Date()): string {
  return dailyRunKey("candle-refresh", now);
}

export function matchPricesBatchRunKey(now = new Date()): string {
  return dailyRunKey("match-prices-batch", now);
}

export function computeScoresRunKey(now = new Date()): string {
  return dailyRunKey("compute-scores", now);
}

export function mlPromotionRunKey(now = new Date()): string {
  return dailyRunKey("ml-promotion", now);
}

export async function enqueuePipelineJob(input: EnqueueJobInput): Promise<{
  readonly run: PipelineRun;
  readonly job: PipelineJob;
}> {
  throwIfCronDeadlineExceeded(input.signal);
  const [run] = await query<PipelineRun>(
    `INSERT INTO pipeline_runs (run_key, type, status, updated_at)
     VALUES ($1, $2, 'queued', NOW())
     ON CONFLICT (run_key) DO UPDATE
       SET updated_at = NOW()
     RETURNING *`,
    [input.runKey, input.runType],
  );

  if (!run) throw new Error("Failed to create or load pipeline run");

  throwIfCronDeadlineExceeded(input.signal);
  const [job] = await query<PipelineJob>(
    `INSERT INTO pipeline_jobs (
       run_id, type, status, priority, payload, max_attempts, idempotency_key, phase, updated_at
     )
     VALUES ($1, $2, 'pending', $3, $4::jsonb, $5, $6, $7, NOW())
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE
       SET updated_at = NOW()
     RETURNING *`,
    [
      run.id,
      input.jobType,
      input.priority ?? 0,
      asJsonbParam(input.payload),
      input.maxAttempts ?? 3,
      input.idempotencyKey,
      input.phase ?? DEFAULT_PHASE,
    ],
  );

  if (!job) throw new Error("Failed to create or load pipeline job");

  throwIfCronDeadlineExceeded(input.signal);
  await appendPipelineJobEvent({
    runId: run.id,
    jobId: job.id,
    eventType: "enqueued",
    status: job.status,
    message: `Queued ${job.type}`,
    payload: { idempotency_key: input.idempotencyKey },
  });

  return { run: normalizeRun(run), job: normalizeJob(job) };
}

export async function enqueueNightlyMlVerifierJob(input: {
  readonly batchSize?: number;
  readonly now?: Date;
  readonly signal?: AbortSignal;
} = {}): Promise<{ readonly run: PipelineRun; readonly job: PipelineJob }> {
  const runKey = nightlyMlVerifierRunKey(input.now);
  const batchSize = input.batchSize ?? DEFAULT_ML_BATCH_SIZE;
  return enqueuePipelineJob({
    runKey,
    runType: "nightly-ml-verifier",
    jobType: "ml_verifier_batch",
    priority: 100,
    idempotencyKey: runKey,
    payload: {
      batch_size: batchSize,
      audit_only: true,
      queued_by: "netlify-scheduled",
    },
    maxAttempts: 3,
    signal: input.signal,
  });
}

export async function enqueueCandleRefreshJob(input: {
  readonly symbols?: readonly string[];
  readonly maxRequestsPerSymbol?: number;
  readonly now?: Date;
  readonly signal?: AbortSignal;
} = {}): Promise<{ readonly run: PipelineRun; readonly job: PipelineJob }> {
  const runKey = candleRefreshRunKey(input.now);
  return enqueuePipelineJob({
    runKey,
    runType: "candle-refresh",
    jobType: "candle_refresh",
    priority: 90,
    idempotencyKey: runKey,
    payload: {
      symbols: input.symbols,
      max_requests_per_symbol: input.maxRequestsPerSymbol ?? 25,
      write: true,
      queued_by: "netlify-scheduled",
    },
    maxAttempts: 3,
    signal: input.signal,
  });
}

export async function enqueueMatchPricesBatchJob(input: {
  readonly limit?: number;
  readonly batchSize?: number;
  readonly startAfterId?: number;
  readonly now?: Date;
  readonly signal?: AbortSignal;
} = {}): Promise<{ readonly run: PipelineRun; readonly job: PipelineJob }> {
  const runKey = matchPricesBatchRunKey(input.now);
  return enqueuePipelineJob({
    runKey,
    runType: "match-prices-batch",
    jobType: "match_prices_batch",
    priority: 80,
    idempotencyKey: runKey,
    payload: {
      limit: input.limit ?? DEFAULT_MATCH_PRICES_LIMIT,
      batch_size: input.batchSize ?? DEFAULT_MATCH_PRICES_BATCH_SIZE,
      start_after_id: input.startAfterId ?? 0,
      rematch_all: false,
      queued_by: "netlify-scheduled",
    },
    maxAttempts: 3,
    signal: input.signal,
  });
}

export async function enqueueComputeScoresJob(input: {
  readonly now?: Date;
  readonly signal?: AbortSignal;
} = {}): Promise<{ readonly run: PipelineRun; readonly job: PipelineJob }> {
  const runKey = computeScoresRunKey(input.now);
  return enqueuePipelineJob({
    runKey,
    runType: "compute-scores",
    jobType: "compute_scores",
    priority: 70,
    idempotencyKey: runKey,
    payload: {
      queued_by: "netlify-scheduled",
    },
    maxAttempts: 2,
    signal: input.signal,
  });
}

export const CLAIM_NEXT_PIPELINE_JOB_SQL = `UPDATE pipeline_jobs
SET
  status = 'running',
  locked_by = $1,
  locked_at = NOW(),
  heartbeat_at = NOW(),
  lease_expires_at = NOW() + ($3::int * INTERVAL '1 second'),
  attempts = attempts + 1,
  updated_at = NOW()
WHERE id = (
  SELECT id
  FROM pipeline_jobs
  WHERE status = 'pending'
    AND run_after <= NOW()
    AND attempts < max_attempts
    AND type = ANY($2::text[])
  ORDER BY priority DESC, run_after ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *`;

export async function updatePipelineJobHeartbeat(
  job: Pick<PipelineJob, "id" | "run_id" | "locked_by">,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `UPDATE pipeline_jobs
     SET heartbeat_at = NOW(),
         lease_expires_at = NOW() + ($2::int * INTERVAL '1 second'),
         updated_at = NOW()
     WHERE id = $1`,
    [job.id, DEFAULT_PIPELINE_JOB_LEASE_SECONDS],
  );

  await appendPipelineJobEvent({
    runId: job.run_id,
    jobId: job.id,
    eventType: "heartbeat",
    status: "running",
    message: "Worker heartbeat",
    payload,
  });
}

export async function resetStalePipelineJobs(input: {
  readonly staleSeconds?: number;
  readonly workerId?: string;
} = {}): Promise<readonly PipelineJob[]> {
  const staleSeconds = Math.max(60, Math.floor(input.staleSeconds ?? DEFAULT_STUCK_JOB_SECONDS));
  const resetJobs = await query<PipelineJob>(
    `UPDATE pipeline_jobs
     SET status = 'pending',
         locked_by = NULL,
         locked_at = NULL,
         heartbeat_at = NULL,
         lease_expires_at = NULL,
         run_after = NOW(),
         updated_at = NOW()
     WHERE id IN (
       SELECT id
       FROM pipeline_jobs
       WHERE status = 'running'
         AND (
           (lease_expires_at IS NOT NULL AND lease_expires_at < NOW())
           OR (lease_expires_at IS NULL AND heartbeat_at IS NOT NULL AND heartbeat_at < NOW() - ($1::int * INTERVAL '1 second'))
           OR (lease_expires_at IS NULL AND heartbeat_at IS NULL AND locked_at IS NOT NULL AND locked_at < NOW() - ($1::int * INTERVAL '1 second'))
         )
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [staleSeconds],
  );

  await Promise.all(
    resetJobs.map((staleJob) => appendPipelineJobEvent({
      runId: staleJob.run_id,
      jobId: staleJob.id,
      eventType: "stale_reset",
      status: "pending",
      message: "Recovered stale running job",
      payload: {
        stale_seconds: staleSeconds,
        reset_by: input.workerId ?? null,
      },
    })),
  );

  return resetJobs.map(normalizeJob);
}

export async function claimNextPipelineJob(input: ClaimNextJobInput): Promise<PipelineJob | null> {
  if (input.types.length === 0) return null;
  const [job] = await query<PipelineJob>(
    CLAIM_NEXT_PIPELINE_JOB_SQL,
    [input.workerId, input.types, DEFAULT_PIPELINE_JOB_LEASE_SECONDS],
  );
  if (!job) return null;

  await query(
    `UPDATE pipeline_runs
     SET status = 'running',
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [job.run_id],
  );

  await appendPipelineJobEvent({
    runId: job.run_id,
    jobId: job.id,
    eventType: "claimed",
    status: "running",
    message: `Claimed by ${input.workerId}`,
    payload: { worker_id: input.workerId, attempts: job.attempts },
  });

  return normalizeJob(job);
}

export async function appendPipelineJobEvent(input: {
  readonly runId: number | null;
  readonly jobId: number | null;
  readonly eventType: string;
  readonly status?: string | null;
  readonly message?: string | null;
  readonly payload?: Record<string, unknown>;
}): Promise<PipelineJobEvent> {
  const [event] = await query<PipelineJobEvent>(
    `INSERT INTO pipeline_job_events (
       run_id, job_id, event_type, status, message, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      input.runId,
      input.jobId,
      input.eventType,
      input.status ?? null,
      input.message ?? null,
      asJsonbParam(input.payload ?? {}),
    ],
  );
  if (!event) throw new Error("Failed to write pipeline job event");
  return normalizeEvent(event);
}

function hashPayload(payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export type DispatchAuditEvent = "started" | "completed" | "failed";

export interface DispatchAuditMeta {
  readonly input_hash: string;
  readonly duration_ms?: number;
  readonly error?: string;
}

export async function auditDispatchEvent(
  job: Pick<PipelineJob, "id" | "run_id" | "payload">,
  event: DispatchAuditEvent,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const auditPayload: Record<string, unknown> = { event, ...meta };

  if (event === "started") {
    auditPayload.input_hash = hashPayload(job.payload);
  }

  await query(
    `UPDATE pipeline_jobs
     SET metrics = COALESCE(metrics, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [job.id, asJsonbParam(auditPayload)],
  );

  await appendPipelineJobEvent({
    runId: job.run_id,
    jobId: job.id,
    eventType: `dispatch_${event}`,
    status: event === "failed" ? "failed" : event === "completed" ? "succeeded" : "running",
    message: `Dispatch ${event}`,
    payload: auditPayload,
  });
}

export async function completePipelineJob(
  job: Pick<PipelineJob, "id" | "run_id">,
  metrics: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `UPDATE pipeline_jobs
     SET status = 'succeeded',
         locked_by = NULL,
         locked_at = NULL,
         heartbeat_at = NULL,
         lease_expires_at = NULL,
         error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [job.id],
  );
  await query(
    `UPDATE pipeline_runs
     SET status = 'succeeded',
         finished_at = NOW(),
         metrics = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [job.run_id, asJsonbParam(metrics)],
  );
  await appendPipelineJobEvent({
    runId: job.run_id,
    jobId: job.id,
    eventType: "completed",
    status: "succeeded",
    message: "Job completed",
    payload: metrics,
  });
}

export async function retryOrFailPipelineJob(
  job: PipelineJob,
  error: unknown,
): Promise<{ readonly retrying: boolean; readonly backoffSeconds: number }> {
  const message = error instanceof Error ? error.message : String(error);
  const retrying = job.attempts < job.max_attempts;
  const backoffSeconds = retrying
    ? Math.min(3600, Math.max(60, 2 ** Math.max(0, job.attempts - 1) * 60))
    : 0;

  await query(
    `UPDATE pipeline_jobs
     SET status = $2,
         locked_by = NULL,
         locked_at = NULL,
         heartbeat_at = NULL,
         lease_expires_at = NULL,
         error = $3,
         run_after = CASE
           WHEN $2 = 'pending' THEN NOW() + ($4::int * INTERVAL '1 second')
           ELSE run_after
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [job.id, retrying ? "pending" : "failed", message.slice(0, 2000), backoffSeconds],
  );

  if (!retrying) {
    await query(
      `UPDATE pipeline_runs
       SET status = 'failed',
           finished_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [job.run_id],
    );
  }

  await appendPipelineJobEvent({
    runId: job.run_id,
    jobId: job.id,
    eventType: retrying ? "retry_scheduled" : "failed",
    status: retrying ? "pending" : "failed",
    message,
    payload: { attempts: job.attempts, max_attempts: job.max_attempts, backoff_seconds: backoffSeconds },
  });

  return { retrying, backoffSeconds };
}

interface CandleFreshnessRow {
  readonly symbol: string;
  readonly candle_count: number | string;
  readonly latest_open_time_ms: string | number | null;
}

function normalizeCandleFreshness(
  rows: readonly CandleFreshnessRow[],
  nowMs = Date.now(),
): readonly CandleFreshness[] {
  const bySymbol = new Map(rows.map((row) => [row.symbol.toUpperCase(), row]));
  return CANDLE_FRESHNESS_SYMBOLS.map((symbol) => {
    const row = bySymbol.get(symbol);
    const latestOpenTime = row?.latest_open_time_ms === null || row?.latest_open_time_ms === undefined
      ? null
      : Number(row.latest_open_time_ms);
    const stalenessSeconds = latestOpenTime === null || !Number.isFinite(latestOpenTime)
      ? null
      : Math.max(0, Math.floor((nowMs - latestOpenTime) / 1000));
    const status = stalenessSeconds === null
      ? "missing"
      : stalenessSeconds <= FRESH_CANDLE_SECONDS
        ? "fresh"
        : "stale";
    return {
      symbol,
      candle_count: Number(row?.candle_count ?? 0),
      latest_open_time_ms: latestOpenTime === null || !Number.isFinite(latestOpenTime)
        ? null
        : String(latestOpenTime),
      latest_candle_at: latestOpenTime === null || !Number.isFinite(latestOpenTime)
        ? null
        : new Date(latestOpenTime).toISOString(),
      staleness_seconds: stalenessSeconds,
      status,
    };
  });
}

export async function getPipelineStatusSnapshot(limit = 20): Promise<PipelineStatusSnapshot> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const [runs, jobs, events, stuckJobs, candleFreshnessRows] = await Promise.all([
    query<PipelineRun>(
      `SELECT * FROM pipeline_runs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    ),
    query<PipelineJob>(
      `SELECT * FROM pipeline_jobs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit],
    ),
    query<PipelineJobEvent>(
      `SELECT * FROM pipeline_job_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit * 3],
    ),
    query<PipelineStuckJob>(
      `SELECT *,
              EXTRACT(EPOCH FROM (NOW() - locked_at))::int AS stuck_seconds
       FROM pipeline_jobs
       WHERE status = 'running'
         AND (
           (lease_expires_at IS NOT NULL AND lease_expires_at < NOW())
           OR (lease_expires_at IS NULL AND locked_at IS NOT NULL AND locked_at <= NOW() - ($1::int * INTERVAL '1 second'))
         )
       ORDER BY locked_at ASC
       LIMIT $2`,
      [DEFAULT_STUCK_JOB_SECONDS, safeLimit],
    ),
    query<CandleFreshnessRow>(
      `SELECT symbol,
              COUNT(*)::int AS candle_count,
              MAX(open_time)::text AS latest_open_time_ms
       FROM candles
       WHERE symbol = ANY($1::text[])
       GROUP BY symbol`,
      [CANDLE_FRESHNESS_SYMBOLS],
    ),
  ]);

  return {
    runs: runs.map(normalizeRun),
    jobs: jobs.map(normalizeJob),
    events: events.map(normalizeEvent),
    stuck_jobs: stuckJobs.map((job) => ({ ...normalizeJob(job), stuck_seconds: job.stuck_seconds })),
    candle_freshness: normalizeCandleFreshness(candleFreshnessRows),
  };
}
