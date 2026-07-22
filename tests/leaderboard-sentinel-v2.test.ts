import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLeaderboardSentinelV2,
  persistLeaderboardSentinelV2,
  type LeaderboardSentinelRow,
  type LeaderboardSentinelSnapshotV2,
} from "../src/lib/sentinels/leaderboard-sentinel-v2";

function row(id: number, rank = id, score = 50 - id / 10, period = "12m"): LeaderboardSentinelRow {
  return {
    creator_id: id,
    creator_name: `Creator ${id}`,
    period,
    rank,
    alpha_score: score,
    effective_n: 40,
    total_calls: 40,
    updated_at: "2026-07-15T03:02:10.000Z",
  };
}

function snapshot(rows: readonly LeaderboardSentinelRow[], generatedAt = "2026-07-15T15:00:00.000Z"): LeaderboardSentinelSnapshotV2 {
  return buildLeaderboardSentinelV2({
    generatedAt,
    publicRows: rows,
    internalRows: rows.map((item) => ({ ...item, period: "all_time" })),
    previousSnapshot: null,
    operational: {
      latest_pipeline_status: "succeeded",
      latest_pipeline_finished_at: "2026-07-15T02:46:31.887Z",
      failed_pipeline_runs_24h: 0,
      failed_pipeline_jobs_24h: 0,
      active_pipeline_jobs: 0,
      pending_transcripts: 12,
      failed_transcripts: 3,
    },
  }).snapshot;
}

test("sentinel v2 retains complete top-100 snapshots without top-10 truncation", () => {
  const rows = Array.from({ length: 120 }, (_, index) => row(index + 1));
  const result = buildLeaderboardSentinelV2({
    generatedAt: "2026-07-15T16:00:00.000Z",
    publicRows: rows,
    internalRows: rows.map((item) => ({ ...item, period: "all_time" })),
    previousSnapshot: null,
    operational: null,
  });

  assert.equal(result.snapshot.public_leaderboard.rows.length, 100);
  assert.equal(result.snapshot.public_leaderboard.source_row_count, 120);
  assert.equal(result.snapshot.public_leaderboard.coverage_limit, 100);
  assert.equal(result.snapshot.public_leaderboard.rows.at(-1)?.rank, 100);
  assert.equal(result.receipt.changes_detected.baseline_status, "bootstrapped_no_prior_v2");
  assert.deepEqual(result.receipt.mutation_flags, {
    db_write_performed: false,
    provider_mutation_performed: false,
    external_mutation_performed: false,
  });
});

test("sentinel v2 compares all retained rows and detects ranks, scores, entrants, and exits", () => {
  const priorRows = Array.from({ length: 100 }, (_, index) => row(index + 1));
  const prior = snapshot(priorRows);
  const currentRows = priorRows
    .filter((item) => item.creator_id !== 100)
    .map((item) => item.creator_id === 75
      ? { ...item, rank: 10, alpha_score: item.alpha_score! + 1.25 }
      : item.creator_id >= 10 && item.creator_id < 75
        ? { ...item, rank: item.rank! + 1 }
        : item);
  currentRows.push(row(101, 100, 41));

  const result = buildLeaderboardSentinelV2({
    generatedAt: "2026-07-15T16:15:00.000Z",
    publicRows: currentRows,
    internalRows: currentRows.map((item) => ({ ...item, period: "all_time" })),
    previousSnapshot: prior,
    scoreMovementThreshold: 0.5,
    operational: null,
  });

  const publicChanges = result.receipt.changes_detected.public_12m;
  assert.equal(publicChanges.rank_changes.some((item) => item.creator_id === 75 && item.previous_rank === 75 && item.current_rank === 10), true);
  assert.equal(publicChanges.score_movements.some((item) => item.creator_id === 75 && item.delta === 1.25), true);
  assert.deepEqual(publicChanges.new_entrants.map((item) => item.creator_id), [101]);
  assert.deepEqual(publicChanges.exits.map((item) => item.creator_id), [100]);
  assert.equal(result.receipt.changes_detected.comparison_coverage, "full_retained_top_100");
});

test("sentinel v2 persists immutable history plus latest pointers and reuses latest snapshot", () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "callscore-sentinel-v2-"));
  const first = persistLeaderboardSentinelV2({
    outputRoot,
    generatedAt: "2026-07-15T16:00:00.000Z",
    publicRows: [row(1)],
    internalRows: [{ ...row(1), period: "all_time" }],
    operational: null,
  });
  const second = persistLeaderboardSentinelV2({
    outputRoot,
    generatedAt: "2026-07-15T16:15:00.000Z",
    publicRows: [{ ...row(1), alpha_score: 51 }],
    internalRows: [{ ...row(1), period: "all_time", alpha_score: 51 }],
    operational: null,
  });

  assert.equal(first.receipt.changes_detected.baseline_status, "bootstrapped_no_prior_v2");
  assert.equal(second.receipt.changes_detected.baseline_status, "compared_to_prior_v2");
  assert.equal(readdirSync(join(outputRoot, "snapshots")).length, 2);
  assert.equal(readdirSync(join(outputRoot, "receipts")).length, 2);
  const latest = JSON.parse(readFileSync(join(outputRoot, "latest-snapshot.json"), "utf8"));
  assert.equal(latest.generated_at_utc, "2026-07-15T16:15:00.000Z");
  assert.equal(second.receipt.snapshot_path.endsWith(".json"), true);
  assert.equal(second.receipt.previous_snapshot_path, first.receipt.snapshot_path);
});

test("sentinel v2 fails closed for empty, missing, stale, or stuck pipeline data", () => {
  const empty = buildLeaderboardSentinelV2({
    generatedAt: "2026-07-16T02:00:00.000Z",
    publicRows: [],
    internalRows: [],
    previousSnapshot: null,
    operational: {
      latest_pipeline_status: null,
      latest_pipeline_finished_at: null,
      failed_pipeline_runs_24h: 0,
      failed_pipeline_jobs_24h: 0,
      active_pipeline_jobs: 2,
      pending_transcripts: 0,
      failed_transcripts: 0,
    },
  });
  const codes = empty.receipt.alerts.map((alert) => alert.code);
  assert.equal(empty.receipt.status, "RED_INTEGRITY_OR_PIPELINE_FAILURE");
  assert.equal(codes.includes("LEADERBOARD_EMPTY"), true);
  assert.equal(codes.includes("LATEST_PIPELINE_STATUS_MISSING"), true);
  assert.equal(codes.includes("PIPELINE_JOBS_ACTIVE"), true);

  const stale = buildLeaderboardSentinelV2({
    generatedAt: "2026-07-16T02:00:00.000Z",
    publicRows: [row(1)],
    internalRows: [{ ...row(1), period: "all_time" }],
    previousSnapshot: null,
    operational: {
      latest_pipeline_status: "succeeded",
      latest_pipeline_finished_at: "2020-01-01T00:00:00.000Z",
      failed_pipeline_runs_24h: 0,
      failed_pipeline_jobs_24h: 0,
      active_pipeline_jobs: 0,
      pending_transcripts: 0,
      failed_transcripts: 0,
    },
  });
  assert.equal(stale.receipt.alerts.some((alert) => alert.code === "LATEST_PIPELINE_STALE"), true);
});

test("sentinel v2 uses content hashes to preserve distinct scans with the same timestamp", () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "callscore-sentinel-collision-"));
  const generatedAt = "2026-07-16T02:00:00.000Z";
  persistLeaderboardSentinelV2({ outputRoot, generatedAt, publicRows: [row(1)], internalRows: [{ ...row(1), period: "all_time" }], operational: null });
  persistLeaderboardSentinelV2({ outputRoot, generatedAt, publicRows: [{ ...row(1), alpha_score: 99 }], internalRows: [{ ...row(1), period: "all_time", alpha_score: 99 }], operational: null });
  assert.equal(readdirSync(join(outputRoot, "snapshots")).length, 2);
  assert.equal(readdirSync(join(outputRoot, "receipts")).length, 2);
});

test("sentinel v2 reports integrity and low-sample anomalies without claiming DB mutation", () => {
  const rows = [
    { ...row(1), rank: 1, effective_n: 4 },
    { ...row(2), rank: 1, effective_n: 2 },
    { ...row(3), rank: 3, alpha_score: Number.NaN },
  ];
  const result = buildLeaderboardSentinelV2({
    generatedAt: "2026-07-15T16:30:00.000Z",
    publicRows: rows,
    internalRows: rows.map((item) => ({ ...item, period: "all_time" })),
    previousSnapshot: null,
    operational: null,
  });

  const codes = result.receipt.alerts.map((item) => item.code);
  assert.equal(codes.includes("DUPLICATE_RANKS"), true);
  assert.equal(codes.includes("INVALID_METRIC_ROWS"), true);
  assert.equal(codes.includes("LOW_EFFECTIVE_SAMPLE"), true);
  assert.equal(result.receipt.mode, "READ_ONLY_NO_MUTATION");
  assert.equal(result.receipt.schema, "callscore.sentinel.read_only_scan_receipt.v2");
});
