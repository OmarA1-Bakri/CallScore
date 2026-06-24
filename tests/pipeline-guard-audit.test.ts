import assert from "node:assert/strict";
import test from "node:test";
import { runPipelineGuardAudit } from "../src/lib/pipeline-guard-audit";

function fakeQuery(rowsByNeedle: Record<string, unknown[]>): <T>(sql: string) => Promise<T[]> {
  return async <T>(sql: string): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ");
    for (const [needle, rows] of Object.entries(rowsByNeedle)) {
      if (normalized.includes(needle)) return rows as T[];
    }
    throw new Error(`Unhandled query: ${normalized.slice(0, 120)}`);
  };
}

test("pipeline guard audit warns on known pre-transition risks", async () => {
  const audit = await runPipelineGuardAudit(fakeQuery({
    "period_stats CROSS JOIN matured_recent": [{ stats_rows: "197", max_total_calls: "0", matured_recent_calls: "42", matured_recent_creators: "7" }],
    "FROM ml_promotion_audit GROUP BY status": [{ status: "dry_run", count: "2" }],
    "WHERE type = 'transcript_collect_laptop'": [{ status: "failed", count: "6", latest_updated_at: "2026-06-20" }],
    "WHERE type = 'candle_refresh'": [{ pending: "1", oldest_pending_at: "2026-06-23" }],
    "FROM candle_daily_closes": [{ latest_candle_day: "2026-06-23", latest_daily_close_day: "2026-06-03", lag_days: "20" }],
    "anomalous_approvals": [{ anomalous_approvals: "22", total_approvals: "653" }],
    "decision = 'approve' AND reason_code <> 'valid_call' GROUP BY reason_code": [{ reason_code: "asset_not_supported", count: "22" }],
    "information_schema.columns": [],
    "candidate_news_channels": [{ candidate_news_channels: "4", with_calls: "3", ranked_snapshot: "1" }],
  }), new Date("2026-06-24T00:00:00.000Z"));
  assert.equal(audit.overall_status, "warn");
  assert.equal(audit.core_pipeline_status, "warn");
  assert.equal(audit.transition_readiness, "warn");
  assert.equal(audit.storm_readiness, "warn");
  assert.equal(audit.public_publish_readiness, "warn");
  assert.equal(audit.checks.length, 7);
  assert.equal(audit.checks.find((check) => check.id === "creator_stats_30d")?.status, "warn");
  assert.equal(audit.checks.find((check) => check.id === "ml_verifier_label_integrity")?.status, "warn");
});
