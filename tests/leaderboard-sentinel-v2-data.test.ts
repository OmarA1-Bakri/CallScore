import test from "node:test";
import assert from "node:assert/strict";
import {
  loadInternalLeaderboardSentinelV2,
  parsePublicLeaderboardV2Payload,
  type ReadOnlyQueryExecutor,
} from "../src/lib/sentinels/leaderboard-sentinel-v2-data";

test("public leaderboard parser keeps every API row up to 100", () => {
  const payload = {
    meta: { period: "12m", total: 100 },
    data: {
      leaderboard: Array.from({ length: 100 }, (_, index) => ({
        rank: index + 1,
        creator: { id: index + 1, name: `Creator ${index + 1}` },
        stats: {
          period: "12m",
          alpha_score: 40 - index / 10,
          effective_n: 35,
          total_calls: 40,
          updated_at: "2026-07-15T03:02:10.000Z",
        },
      })),
    },
  };
  const rows = parsePublicLeaderboardV2Payload(payload);
  assert.equal(rows.length, 100);
  assert.equal(rows[99].rank, 100);
  assert.equal(rows[99].creator_id, 100);
});

test("public leaderboard parser rejects malformed payload instead of fabricating data", () => {
  assert.throws(() => parsePublicLeaderboardV2Payload({ meta: { period: "12m" }, data: { leaderboard: [{ rank: 1 }] } }), /malformed public leaderboard row/);
  assert.throws(() => parsePublicLeaderboardV2Payload({ meta: { period: "all_time" }, data: { leaderboard: [] } }), /meta\.period must be 12m/);
  assert.throws(() => parsePublicLeaderboardV2Payload({ meta: { period: "12m" }, data: { leaderboard: [{ rank: 0, creator: { id: 1, name: "Bad" }, stats: { period: "12m", alpha_score: 1 } }] } }), /rank at index 0/);
});

test("internal sentinel loader issues SELECT-only queries and normalizes numeric database fields", async () => {
  const sql: string[] = [];
  const execute: ReadOnlyQueryExecutor = async (statement) => {
    sql.push(statement);
    if (statement.includes("FROM creator_stats")) {
      return [{
        creator_id: "7",
        creator_name: "Tracked Creator",
        period: "all_time",
        rank: "3",
        alpha_score: "42.5",
        effective_n: "28",
        total_calls: "31",
        updated_at: "2026-07-15T03:02:10.000Z",
      }];
    }
    return [{
      latest_pipeline_status: "succeeded",
      latest_pipeline_finished_at: "2026-07-15T02:46:31.887Z",
      failed_pipeline_runs_24h: "0",
      failed_pipeline_jobs_24h: "0",
      active_pipeline_jobs: "0",
      pending_transcripts: "5096",
      failed_transcripts: "4927",
    }];
  };

  const data = await loadInternalLeaderboardSentinelV2(execute);
  assert.equal(sql.length, 2);
  assert.equal(sql.every((statement) => /^\s*SELECT\b/i.test(statement)), true);
  assert.match(sql[1], /type = 'compute-scores'/);
  assert.doesNotMatch(sql[1], /type = 'compute_scores'/);
  assert.equal(data.rows[0].creator_id, 7);
  assert.equal(data.rows[0].alpha_score, 42.5);
  assert.equal(data.operational.pending_transcripts, 5096);
});
