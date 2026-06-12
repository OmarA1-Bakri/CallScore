import { readFileSync } from "node:fs";
import { appendPipelineJobEvent, claimNextPipelineJob, completePipelineJob, retryOrFailPipelineJob, type PipelineJob } from "../lib/pipeline";
import { query } from "../lib/db";
import { loadEnv } from "./script-helpers";

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

function normalizeJob(row: PipelineJob): PipelineJob {
  return { ...row, payload: parseJsonObject(row.payload), metrics: parseJsonObject(row.metrics) };
}

async function loadJob(jobId: number): Promise<PipelineJob> {
  const [job] = await query<PipelineJob>("SELECT * FROM pipeline_jobs WHERE id = $1", [jobId]);
  if (!job) throw new Error(`job_not_found:${jobId}`);
  return normalizeJob(job);
}

function readStateMetrics(path: string | null): Record<string, unknown> {
  if (!path) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { collector_state_path: path, collector_state: parsed as Record<string, unknown> } : { collector_state_path: path };
  } catch (error) {
    return { collector_state_path: path, collector_state_error: error instanceof Error ? error.message : String(error) };
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const command = argv[0] ?? "claim";
  if (command === "claim") {
    const workerId = argValue(argv, "--worker-id") ?? `laptop-runner-${process.pid}`;
    const job = await claimNextPipelineJob({ workerId, types: ["transcript_collect_laptop"] });
    if (!job) {
      console.log(JSON.stringify({ claimed: false }));
      return;
    }
    await appendPipelineJobEvent({
      runId: job.run_id,
      jobId: job.id,
      eventType: "laptop_runner_claimed",
      status: "running",
      message: "Laptop transcript runner claimed workplane job",
      payload: { worker_id: workerId },
    });
    console.log(JSON.stringify({ claimed: true, job: { id: job.id, run_id: job.run_id, type: job.type, payload: job.payload } }));
    return;
  }

  if (command === "complete") {
    const jobId = Number(argValue(argv, "--job-id"));
    if (!Number.isInteger(jobId) || jobId <= 0) throw new Error("--job-id is required");
    const status = argValue(argv, "--status") ?? "succeeded";
    const statePath = argValue(argv, "--state-path");
    const metrics: Record<string, unknown> = { mode: "laptop_runner", status, ...readStateMetrics(statePath) };
    const job = await loadJob(jobId);
    if (status === "succeeded") {
      await completePipelineJob(job, metrics);
    } else {
      await retryOrFailPipelineJob(job, new Error(String((metrics.collector_state as Record<string, unknown> | undefined)?.cooldown_reason ?? status)));
      await appendPipelineJobEvent({ runId: job.run_id, jobId: job.id, eventType: "laptop_runner_failed", status: "failed", message: status, payload: metrics });
    }
    console.log(JSON.stringify({ ok: true, job_id: jobId, status }));
    return;
  }

  throw new Error(`unsupported_command:${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
