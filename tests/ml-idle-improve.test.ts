import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMlIdleImproveReport, parseMlIdleImproveArgs } from "../src/scripts/ml-idle-improve";

function writeJsonl(path: string, rows: readonly unknown[]) {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

const video = {
  id: 1,
  creator_id: 2,
  creator_name: "Creator",
  youtube_handle: "@creator",
  youtube_video_id: "abc123",
  title: "BTC call",
  published_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
};

test("ml idle improve summarizes shadow and diff artifacts without promotion", () => {
  const dir = mkdtempSync(join(tmpdir(), "ml-idle-"));
  const shadowIn = join(dir, "shadow.jsonl");
  const diffIn = join(dir, "shadow.diff.jsonl");
  const fixtures = join(dir, "fixtures.jsonl");
  writeJsonl(shadowIn, [
    {
      record_type: "shadow_extraction",
      ts: "2026-01-01T00:00:00.000Z",
      run_id: "shadow-test",
      provider: "ollama",
      model: "callscore-gemma4-extractor:latest",
      fallback_model: null,
      video,
      transcript_sha256: "abc",
      transcript_length: 100,
      prompt_version: "callscore-gemma4-shadow-v1",
      schema_valid: true,
      confidence_distribution: { min: 0.9, max: 0.9, average: 0.9, high_confidence_count: 1, medium_confidence_count: 0, low_confidence_count: 0 },
      parser_errors: [],
      latency_ms: 100,
      comparison_to_rule_extractor: { status: "pending_shadow_diff", note: "pending" },
      candidate_count: 1,
      accepted_count: 1,
      accepted_calls: [],
      chunk_summary: { chunk_count: 1, covered_until_offset: 100, reached_transcript_end: true },
      error: null,
    },
  ]);
  writeJsonl(diffIn, [
    { record_type: "shadow_diff", ts: "2026-01-01T00:00:00.000Z", run_id: "shadow-test", video, status: "new_calls", existing_count: 0, accepted_count: 1, unchanged_count: 0, added: ["BTC bullish"], removed: [], reasons: [] },
  ]);
  writeJsonl(fixtures, [{ id: "fixture-1" }]);

  const report = buildMlIdleImproveReport({ shadowIn, diffIn, fixtures, out: join(dir, "out.json") }, "ml-idle-test");
  assert.equal(report.metrics.shadow_records, 1);
  assert.equal(report.metrics.fixture_records, 1);
  assert.equal(report.metrics.json_valid_rate, 1);
  assert.equal(report.metrics.schema_pass_rate, 1);
  assert.equal(report.metrics.diff_status_counts.new_calls, 1);
  assert.equal(report.promotion_gate.eligible_for_write_canary, false);
  assert.equal(report.production_default_changed, false);
  assert.ok(report.promotion_gate.reasons.includes("manual_or_eval_approval_not_recorded"));
});

test("ml idle improve parser accepts explicit artifact paths", () => {
  const args = parseMlIdleImproveArgs(["--shadow-in", "s.jsonl", "--diff-in", "d.jsonl", "--fixtures", "f.jsonl", "--out", "out.json"]);
  assert.equal(args.shadowIn, "s.jsonl");
  assert.equal(args.diffIn, "d.jsonl");
  assert.equal(args.fixtures, "f.jsonl");
  assert.equal(args.out, "out.json");
});

test("ml idle improve command writes a report artifact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ml-idle-main-"));
  const shadowIn = join(dir, "shadow.jsonl");
  const fixtures = join(dir, "fixtures.jsonl");
  const out = join(dir, "report.json");
  writeJsonl(shadowIn, []);
  writeJsonl(fixtures, []);
  const { main } = await import("../src/scripts/ml-idle-improve");
  await main(["--shadow-in", shadowIn, "--fixtures", fixtures, "--out", out]);
  const report = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(report.record_type, "ml_idle_improvement_report");
  assert.equal(report.production_default_changed, false);
});
