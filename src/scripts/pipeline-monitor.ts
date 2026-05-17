#!/usr/bin/env node --env-file=.env.local --import tsx
// pipeline-monitor.ts: Check job state, heal stuck jobs, start worker if pending queue exists
import { query } from "../lib/db";
import { appendFileSync } from "node:fs";
import { createLogger } from "../lib/logger";

const STALE_SECONDS = 30 * 60; // matches pipeline.ts default
const LOG_PATH = ".tmp/pipeline-monitor.log";
const logger = createLogger({ component: "pipeline-monitor" });

interface StuckJob { id: number; type: string; locked_by: string | null; heartbeat_at: string | null; locked_at: string | null; }
interface PendingJob { id: number; type: string; priority: number; }
interface FailedJob { id: number; type: string; attempts: number; max_attempts: number; }

async function safeQuery<T = any>(q: string, params?: unknown[]): Promise<T[]> {
  try { return (params ? await query(q, params) : await query(q)) as T[]; }
  catch(e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("does not exist")) {
      logger.warn("safeQuery_relation_missing", { query_preview: q.slice(0, 120), error: msg });
      return [];
    }
    logger.error("safeQuery_fatal", { query_preview: q.slice(0, 120), error: msg });
    throw e;
  }
}

async function main() {
  const now = new Date().toISOString();

  // Check for stuck running jobs
  const stuck = await safeQuery<StuckJob>(
    `SELECT id, type, locked_by, heartbeat_at, locked_at FROM pipeline_jobs WHERE status = 'running' AND ((heartbeat_at IS NOT NULL AND heartbeat_at < NOW() - INTERVAL '1 second' * $1) OR (heartbeat_at IS NULL AND locked_at IS NOT NULL AND locked_at < NOW() - INTERVAL '1 second' * $1))`,
    [STALE_SECONDS]
  );

  // Check for pending jobs
  const pending = await safeQuery<PendingJob>(
    `SELECT id, type, priority FROM pipeline_jobs WHERE status = 'pending' AND run_after <= NOW() ORDER BY priority DESC, run_after LIMIT 1`
  );

  // Check for failed jobs retryable
  const failed = await safeQuery<FailedJob>(
    `SELECT id, type, attempts, max_attempts FROM pipeline_jobs WHERE status = 'failed' AND attempts < max_attempts LIMIT 10`
  );

  // Reset stuck jobs to pending
  if (stuck.length > 0) {
    logger.warn("stuck_jobs_found", { count: stuck.length, jobs: stuck.map(j => j.id) });
    for (const j of stuck) {
      await safeQuery(
        `UPDATE pipeline_jobs SET status = 'pending', locked_by = NULL, locked_at = NULL, heartbeat_at = NULL, run_after = NOW(), updated_at = NOW() WHERE id = $1`,
        [j.id]
      );
    }
    logger.info("stuck_jobs_reset_to_pending", { ids: stuck.map(j => j.id) });
  }

  // Reset failed jobs to pending (retry)
  if (failed.length > 0) {
    logger.warn("failed_jobs_retryable", { count: failed.length });
    for (const j of failed) {
      await safeQuery(
        `UPDATE pipeline_jobs SET status = 'pending', locked_by = NULL, locked_at = NULL, heartbeat_at = NULL, run_after = NOW(), updated_at = NOW() WHERE id = $1`,
        [j.id]
      );
    }
    logger.info("failed_jobs_reset_to_pending", { ids: failed.map(j => j.id) });
  }

  if ((pending.length > 0 || stuck.length > 0 || failed.length > 0)) {
    logger.info("queue_action_needed", { pending: pending.length, stuck: stuck.length, failed_retried: failed.length });
  } else {
    const running = await safeQuery<{ cnt: string }>(`SELECT COUNT(*) as cnt FROM pipeline_jobs WHERE status = 'running'`);
    logger.info("queue_healthy", { running: Number(running[0]?.cnt ?? 0) });
  }

  const summary = `[${now}] Monitor: stuck=${stuck.length} pending=${pending.length} failed_retryable=${failed.length}\n`;
  try { appendFileSync(LOG_PATH, summary); } catch {}
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
