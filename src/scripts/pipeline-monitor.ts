#!/usr/bin/env node --env-file=.env.local --import tsx
// pipeline-monitor.ts: Check job state, heal stuck jobs, start worker if pending queue exists
import { query } from "../lib/db";
import { appendFileSync } from "node:fs";
import { createLogger } from "../lib/logger";

const STALE_SECONDS = 30 * 60; // matches pipeline.ts default
const LOG_PATH = ".tmp/pipeline-monitor.log";

async function safeQuery(q: string, params?: unknown[]) {
  try { return params ? await query(q, params) : await query(q); }
  catch(e) { console.error("DB error:", e instanceof Error ? e.message : e); return []; }
}

async function main() {
  const logger = createLogger({ component: "pipeline-monitor" });
  const now = new Date().toISOString();

  // Check for stuck running jobs
  const stuck = await safeQuery(
    `SELECT id, type, locked_by, heartbeat_at, locked_at FROM pipeline_jobs WHERE status = 'running' AND ((heartbeat_at IS NOT NULL AND heartbeat_at < NOW() - INTERVAL '${STALE_SECONDS} seconds') OR (heartbeat_at IS NULL AND locked_at IS NOT NULL AND locked_at < NOW() - INTERVAL '${STALE_SECONDS} seconds'))`
  );

  // Check for pending jobs
  const pending = await safeQuery(
    `SELECT id, type, priority FROM pipeline_jobs WHERE status = 'pending' AND run_after <= NOW() ORDER BY priority DESC, run_after LIMIT 1`
  );

  // Check for failed jobs retryable
  const failed = await safeQuery(
    `SELECT id, type, attempts, max_attempts FROM pipeline_jobs WHERE status = 'failed' AND attempts < max_attempts LIMIT 10`
  );

  // Reset stuck jobs to pending
  if (stuck.length > 0) {
    logger.warn("stuck_jobs_found", { count: stuck.length, jobs: stuck });
    for (const j of stuck as any[]) {
      await safeQuery(
        `UPDATE pipeline_jobs SET status = 'pending', locked_by = NULL, locked_at = NULL, heartbeat_at = NULL, run_after = NOW(), updated_at = NOW() WHERE id = $1`,
        [j.id]
      );
    }
    logger.info("stuck_jobs_reset_to_pending", { ids: stuck.map((j: any) => j.id) });
  }

  // Reset failed jobs to pending (retry)
  if (failed.length > 0) {
    logger.warn("failed_jobs_retryable", { count: failed.length });
    for (const j of failed as any[]) {
      await safeQuery(
        `UPDATE pipeline_jobs SET status = 'pending', locked_by = NULL, locked_at = NULL, heartbeat_at = NULL, run_after = NOW(), updated_at = NOW() WHERE id = $1`,
        [j.id]
      );
    }
    logger.info("failed_jobs_reset_to_pending", { ids: failed.map((j: any) => j.id) });
  }

  if ((pending.length > 0 || stuck.length > 0 || failed.length > 0)) {
    logger.info("queue_action_needed", { pending: pending.length, stuck: stuck.length, failed_retried: failed.length });
  } else {
    const running = await safeQuery(`SELECT COUNT(*) as cnt FROM pipeline_jobs WHERE status = 'running'`);
    logger.info("queue_healthy", { running: (running as any[])[0]?.cnt ?? 0 });
  }

  // Log summary
  const summary = `[${now}] Monitor: stuck=${stuck.length} pending=${pending.length} failed_retryable=${failed.length}\n`;
  try { appendFileSync(LOG_PATH, summary); } catch {}
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
