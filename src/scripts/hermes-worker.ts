import os from "node:os";
import {
  appendPipelineJobEvent,
  claimNextPipelineJob,
  completePipelineJob,
  enqueuePipelineJob,
  retryOrFailPipelineJob,
  type PipelineJob,
} from "../lib/pipeline";
import { runMlVerifierBatch } from "../lib/ml-verifier";
import { query } from "../lib/db";
import { loadEnv, sleep, timestamp } from "./script-helpers";

const SUPPORTED_JOB_TYPES = ["ml_verifier_batch", "hermes_smoke_test"] as const;
const DEFAULT_POLL_MS = 15_000;

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
  if (job.type === "hermes_smoke_test") return runSmokeJob(job);
  if (job.type === "ml_verifier_batch") return runMlVerifierBatch(job) as Promise<Record<string, unknown>>;
  throw new Error(`Unsupported pipeline job type: ${job.type}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseHermesWorkerArgs(argv);
  const claimTypes = args.dryRun ? ["hermes_smoke_test"] : [...SUPPORTED_JOB_TYPES];
  let stopping = false;
  let processed = 0;

  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  console.log(`[${timestamp()}] Hermes worker starting: worker=${args.workerId}, once=${args.once}, dryRun=${args.dryRun}`);
  await checkDatabaseConnection();
  console.log(`[${timestamp()}] Database connection OK`);

  if (args.dryRun) {
    await enqueueSmokeJob(args.workerId);
    console.log(`[${timestamp()}] Smoke job enqueued for dry-run`);
  }

  while (!stopping && processed < args.maxJobs) {
    const job = await claimNextPipelineJob({ workerId: args.workerId, types: claimTypes });
    if (!job) {
      if (args.once) {
        console.log(`[${timestamp()}] No pending jobs for ${claimTypes.join(",")}; exiting`);
        break;
      }
      await sleep(args.pollMs);
      continue;
    }

    console.log(`[${timestamp()}] Claimed job ${job.id} (${job.type}), attempt ${job.attempts}/${job.max_attempts}`);
    try {
      const metrics = await executeJob(job);
      await completePipelineJob(job, metrics);
      console.log(`[${timestamp()}] Completed job ${job.id} (${job.type})`);
    } catch (error) {
      const result = await retryOrFailPipelineJob(job, error);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Job ${job.id} failed: ${message}; retrying=${result.retrying}`);
    }

    processed += 1;
    if (args.once) break;
  }

  console.log(`[${timestamp()}] Hermes worker stopped after ${processed} job(s)`);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[${timestamp()}] Hermes worker fatal error: ${message}`);
    process.exit(1);
  });
}
