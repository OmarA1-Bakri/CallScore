import { query } from "./db";

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
  readonly run_after: string;
  readonly idempotency_key: string | null;
  readonly error: string | null;
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

interface EnqueueJobInput {
  readonly runKey: string;
  readonly runType: string;
  readonly jobType: string;
  readonly payload: Record<string, unknown>;
  readonly priority?: number;
  readonly idempotencyKey: string;
  readonly maxAttempts?: number;
}

interface ClaimNextJobInput {
  readonly workerId: string;
  readonly types: readonly string[];
}

export interface PipelineStatusSnapshot {
  readonly runs: readonly PipelineRun[];
  readonly jobs: readonly PipelineJob[];
  readonly events: readonly PipelineJobEvent[];
}

const DEFAULT_ML_BATCH_SIZE = 250;

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
  return { ...row, payload: readPayload(row.payload) };
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

export async function enqueuePipelineJob(input: EnqueueJobInput): Promise<{
  readonly run: PipelineRun;
  readonly job: PipelineJob;
}> {
  const [run] = await query<PipelineRun>(
    `INSERT INTO pipeline_runs (run_key, type, status, updated_at)
     VALUES ($1, $2, 'queued', NOW())
     ON CONFLICT (run_key) DO UPDATE
       SET updated_at = NOW()
     RETURNING *`,
    [input.runKey, input.runType],
  );

  if (!run) throw new Error("Failed to create or load pipeline run");

  const [job] = await query<PipelineJob>(
    `INSERT INTO pipeline_jobs (
       run_id, type, status, priority, payload, max_attempts, idempotency_key, updated_at
     )
     VALUES ($1, $2, 'pending', $3, $4::jsonb, $5, $6, NOW())
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
    ],
  );

  if (!job) throw new Error("Failed to create or load pipeline job");

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
      queued_by: "vercel-cron",
    },
    maxAttempts: 3,
  });
}

export const CLAIM_NEXT_PIPELINE_JOB_SQL = `UPDATE pipeline_jobs
SET
  status = 'running',
  locked_by = $1,
  locked_at = NOW(),
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

export async function claimNextPipelineJob(input: ClaimNextJobInput): Promise<PipelineJob | null> {
  if (input.types.length === 0) return null;
  const [job] = await query<PipelineJob>(
    CLAIM_NEXT_PIPELINE_JOB_SQL,
    [input.workerId, input.types],
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

export async function completePipelineJob(
  job: Pick<PipelineJob, "id" | "run_id">,
  metrics: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `UPDATE pipeline_jobs
     SET status = 'succeeded',
         locked_by = NULL,
         locked_at = NULL,
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

export async function getPipelineStatusSnapshot(limit = 20): Promise<PipelineStatusSnapshot> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const [runs, jobs, events] = await Promise.all([
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
  ]);

  return {
    runs: runs.map(normalizeRun),
    jobs: jobs.map(normalizeJob),
    events: events.map(normalizeEvent),
  };
}
