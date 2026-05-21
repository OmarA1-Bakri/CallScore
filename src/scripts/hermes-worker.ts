import os from "node:os";
import { retryWithBackoff } from "../lib/pipeline/retry";
import {
  appendPipelineJobEvent,
  claimNextPipelineJob,
  completePipelineJob,
  enqueuePipelineJob,
  resetStalePipelineJobs,
  retryOrFailPipelineJob,
  updatePipelineJobHeartbeat,
  type PipelineJob,
} from "../lib/pipeline";
import {
  runCandleRefreshJob,
  runComputeScoresJob,
  runMatchPricesJob,
} from "../lib/pipeline-jobs";
import { runMlVerifierBatch } from "../lib/ml-verifier";
import {
  PROMOTE_ML_VERIFIED_JOB_TYPE,
  runMlPromotionJob,
} from "../lib/ml-promotion";
import { query } from "../lib/db";
import { createLogger } from "../lib/logger";
import { captureException, flushMonitoring, initMonitoring } from "../lib/monitoring";
import { loadEnv, sleep, timestamp } from "./script-helpers";

export const SUPPORTED_JOB_TYPES = [
  "ml_verifier_batch",
  "hermes_smoke_test",
  "candle_refresh",
  "match_prices_batch",
  "compute_scores",
  PROMOTE_ML_VERIFIED_JOB_TYPE,
] as const;
const DEFAULT_POLL_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface WorkerArgs {
  readonly once: boolean;
  readonly dryRun: boolean;
  readonly workerId: string;
  readonly pollMs: number;
  readonly maxJobs: number;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseHermesWorkerArgs(argv = process.argv.slice(2)): WorkerArgs {
  const workerId = argValue(argv, "--worker-id")
    ?? process.env.HERMES_WORKER_ID
    ?? `${os.hostname()}-${process.pid}`;
  return {
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run"),
    workerId,
    pollMs: positiveInt(argValue(argv, "--poll-ms"), DEFAULT_POLL_MS),
    maxJobs: positiveInt(argValue(argv, "--max-jobs"), Number.MAX_SAFE_INTEGER),
  };
}

async function checkDatabaseConnection(): Promise<void> {
  await query("SELECT 1 AS ok");
}

async function enqueueSmokeJob(workerId: string): Promise<void> {
  const key = `hermes-smoke:${workerId}:${Date.now()}`;
  await enqueuePipelineJob({
    runKey: key,
    runType: "hermes-smoke-test",
    jobType: "hermes_smoke_test",
    priority: 1000,
    idempotencyKey: key,
    maxAttempts: 1,
    payload: {
      smoke: true,
      worker_id: workerId,
      queued_at: timestamp(),
    },
  });
}

async function runSmokeJob(job: PipelineJob): Promise<Record<string, unknown>> {
  await appendPipelineJobEvent({
    runId: job.run_id,
    jobId: job.id,
    eventType: "smoke_check",
    status: "running",
    message: "Hermes smoke job claimed and executed",
    payload: { worker_id: job.locked_by, dry_run: true },
  });
  return { smoke: true, dry_run: true };
}

async function executeJob(job: PipelineJob): Promise<Record<string, unknown>> {
  return retryWithBackoff(
    async () => {
      if (job.type === "hermes_smoke_test") return runSmokeJob(job);
      if (job.type === "ml_verifier_batch") return runMlVerifierBatch(job) as Promise<Record<string, unknown>>;
      if (job.type === "candle_refresh") return runCandleRefreshJob(job);
      if (job.type === "match_prices_batch") return runMatchPricesJob(job);
      if (job.type === "compute_scores") return runComputeScoresJob();
      if (job.type === PROMOTE_ML_VERIFIED_JOB_TYPE) return runMlPromotionJob(job);
      throw new Error(`Unsupported pipeline job type: ${job.type}`);
    },
    {
      shouldRetry: (err: Error) => !err.message.startsWith("Unsupported pipeline job type:"),
    },
  );
}

export async function executeJobWithKeepalive(
  job: PipelineJob,
  logger: ReturnType<typeof createLogger>,
): Promise<Record<string, unknown>> {
  await updatePipelineJobHeartbeat(job, { worker_id: job.locked_by, phase: "start" });

  const heartbeat = setInterval(() => {
    void updatePipelineJobHeartbeat(job, { worker_id: job.locked_by }).catch((error) => {
      logger.warn("job_heartbeat_failed", {
        job_id: job.id,
        run_id: job.run_id,
        job_type: job.type,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    return await executeJob(job);
  } finally {
    clearInterval(heartbeat);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseHermesWorkerArgs(argv);
  const claimTypes = args.dryRun ? ["hermes_smoke_test"] : [...SUPPORTED_JOB_TYPES];
  const logger = createLogger({
    component: "hermes-worker",
    worker_id: args.workerId,
    dry_run: args.dryRun,
    once: args.once,
  });
  let stopping = false;
  let processed = 0;

  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  await initMonitoring({ serviceName: "hermes-worker" });
  logger.info("worker_start", { poll_ms: args.pollMs, max_jobs: args.maxJobs });
  await checkDatabaseConnection();
  logger.info("database_ok");

  if (args.dryRun) {
    await enqueueSmokeJob(args.workerId);
    logger.info("smoke_job_enqueued");
  }

  while (!stopping && processed < args.maxJobs) {
    const resetJobs = await resetStalePipelineJobs({ workerId: args.workerId });
    if (resetJobs.length > 0) {
      logger.warn("stale_jobs_reset", {
        job_ids: resetJobs.map((job) => job.id),
        count: resetJobs.length,
      });
    }

    const job = await claimNextPipelineJob({ workerId: args.workerId, types: claimTypes });
    if (!job) {
      if (args.once) {
        logger.info("no_pending_jobs", { claim_types: claimTypes });
        break;
      }
      await sleep(args.pollMs);
      continue;
    }

    logger.info("job_claimed", {
      job_id: job.id,
      job_type: job.type,
      run_id: job.run_id,
      attempt: job.attempts,
      max_attempts: job.max_attempts,
    });
    try {
      const metrics = await executeJobWithKeepalive(job, logger);
      await completePipelineJob(job, metrics);
      logger.info("job_completed", {
        job_id: job.id,
        job_type: job.type,
        run_id: job.run_id,
      });
    } catch (error) {
      const result = await retryOrFailPipelineJob(job, error);
      await captureException(error, {
        serviceName: "hermes-worker",
        tags: {
          component: "hermes-worker",
          job_type: job.type,
          retrying: result.retrying,
        },
        extra: {
          job_id: job.id,
          run_id: job.run_id,
          attempt: job.attempts,
          max_attempts: job.max_attempts,
        },
      });
      const message = error instanceof Error ? error.message : String(error);
      logger.error("job_failed", {
        job_id: job.id,
        job_type: job.type,
        run_id: job.run_id,
        retrying: result.retrying,
        error: message,
      });
    }

    processed += 1;
    if (args.once) break;
  }

  logger.info("worker_stopped", { processed });
  try {
    await flushMonitoring();
  } catch (err) {
    logger.error("monitoring_flush_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    const logger = createLogger({ component: "hermes-worker" });
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    logger.error("fatal_error", { error: message });
    try {
      loadEnv();
      await initMonitoring({ serviceName: "hermes-worker" });
      await captureException(error, {
        serviceName: "hermes-worker",
        tags: { component: "hermes-worker", fatal: true },
      });
      await flushMonitoring();
    } catch (monitoringError) {
      const monitoringMessage = monitoringError instanceof Error ? monitoringError.message : String(monitoringError);
      logger.error("fatal_monitoring_error", { error: monitoringMessage });
    }
    process.exit(1);
  });
}
