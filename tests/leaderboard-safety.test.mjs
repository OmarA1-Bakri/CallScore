import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bucketLeaderboardRows,
  classifyLeaderboardRow,
  getOfficialThreshold,
  isExcludedCreator,
  normalizeCreatorIdentity,
  publicEligibleCallsWhereSql,
  publicVisibleCallsWhereSql,
  toReadApiLeaderboardContract,
} from "../src/lib/leaderboard-safety.mjs";

const NOW = new Date("2026-06-11T00:00:00.000Z");

function row(overrides = {}) {
  return {
    period: "all_time",
    creator_id: 1,
    name: "Valid Alpha",
    youtube_handle: "@ValidAlpha",
    youtube_channel_id: "UCVALID",
    accuracy_rank: 7,
    total_calls: 75,
    latest_video_date: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

test("normalizeCreatorIdentity canonicalizes name, handle, and channel id", () => {
  assert.deepEqual(
    normalizeCreatorIdentity({
      name: " Altcoin   Daily ",
      youtube_handle: "@AltcoinDaily",
      youtube_channel_id: " UCbLhGKVY-bJPcawebgtNfbw ",
    }),
    {
      name: "altcoin daily",
      compactName: "altcoindaily",
      handle: "altcoindaily",
      channelId: "ucblhgkvy-bjpcawebgtnfbw",
      aliases: [],
    },
  );
});

test("isExcludedCreator hard-excludes Altcoin Daily identifier variants", () => {
  for (const candidate of [
    { name: "Altcoin Daily" },
    { name: "altcoin daily" },
    { name: "AltcoinDaily" },
    { youtube_handle: "@AltcoinDaily" },
    { youtube_handle: "@altcoindaily" },
    { youtube_handle: "altcoindaily" },
    { youtube_channel_id: "UCbLhGKVY-bJPcawebgtNfbw" },
  ]) {
    assert.equal(isExcludedCreator(candidate), true, JSON.stringify(candidate));
  }

  assert.equal(isExcludedCreator({ name: "Valid Alpha", youtube_handle: "@ValidAlpha" }), false);
});

test("classifyLeaderboardRow blocks excluded, stale, low-N, null-rank, and zero-call official rows", () => {
  assert.equal(classifyLeaderboardRow(row({ name: "Altcoin Daily" }), { now: NOW }).bucket, "excludedRows");
  assert.equal(
    classifyLeaderboardRow(row({ name: "Alex Becker's Channel", youtube_handle: "@AlexBeckersChannel", total_calls: 24, accuracy_rank: 1, latest_video_date: "2025-10-11T00:00:00.000Z" }), { now: NOW }).bucket,
    "staleRows",
  );
  assert.equal(classifyLeaderboardRow(row({ name: "MoneyZG", total_calls: 12, accuracy_rank: 2 }), { now: NOW }).bucket, "provisionalRows");
  assert.equal(classifyLeaderboardRow(row({ name: "Crypto Inspector", total_calls: 8, accuracy_rank: 3 }), { now: NOW }).bucket, "watchlistRows");
  assert.equal(classifyLeaderboardRow(row({ accuracy_rank: null }), { now: NOW }).bucket, "provisionalRows");
  assert.equal(classifyLeaderboardRow(row({ total_calls: 0 }), { now: NOW }).bucket, "watchlistRows");
  assert.equal(classifyLeaderboardRow(row(), { now: NOW }).bucket, "officialRankedRows");
});

test("invalid freshness dates are not freshness proof for official rows", () => {
  const classification = classifyLeaderboardRow(
    row({ name: "Bad Date", total_calls: 75, accuracy_rank: 1, latest_video_date: "not-a-date" }),
    { now: NOW },
  );

  assert.notEqual(classification.bucket, "officialRankedRows");
  assert.equal(classification.bucket, "watchlistRows");
});

test("thresholds enforce hard commercial floor", () => {
  assert.equal(getOfficialThreshold("all_time"), 50);
  assert.equal(getOfficialThreshold("12m"), 25);
  assert.equal(getOfficialThreshold("90d"), 25);
  assert.equal(getOfficialThreshold("30d"), Number.POSITIVE_INFINITY);
});

test("bucketLeaderboardRows returns safe buckets and counts", () => {
  const buckets = bucketLeaderboardRows(
    [
      row({ name: "Altcoin Daily", total_calls: 429, accuracy_rank: 19 }),
      row({ name: "Alex Becker's Channel", youtube_handle: "@AlexBeckersChannel", total_calls: 24, accuracy_rank: 1, latest_video_date: "2025-10-11T00:00:00.000Z" }),
      row({ name: "MoneyZG", total_calls: 12, accuracy_rank: 2 }),
      row({ name: "Crypto Inspector", total_calls: 8, accuracy_rank: 3 }),
      row({ name: "Valid Alpha", total_calls: 75, accuracy_rank: 4 }),
      row({ name: "Null Rank", total_calls: 80, accuracy_rank: null }),
      row({ name: "Zero Calls", total_calls: 0, accuracy_rank: 5 }),
    ],
    { period: "all_time", now: NOW },
  );

  assert.deepEqual(buckets.officialRankedRows.map((item) => item.name), ["Valid Alpha"]);
  assert.deepEqual(buckets.excludedRows.map((item) => item.name), ["Altcoin Daily"]);
  assert.equal(buckets.excludedRows[0].exclusionReason, "EXCLUDED_MEDIA_NEWS_CHANNEL");
  assert.deepEqual(buckets.staleRows.map((item) => item.name), ["Alex Becker's Channel"]);
  assert.deepEqual(buckets.provisionalRows.map((item) => item.name), ["MoneyZG", "Null Rank"]);
  assert.deepEqual(buckets.watchlistRows.map((item) => item.name), ["Crypto Inspector", "Zero Calls"]);
  assert.equal(buckets.counts.officialRankedCreators, 1);
  assert.equal(buckets.counts.excludedCreators, 1);
  assert.equal(buckets.counts.publicEligibleCalls, 199);
});

test("30d period disables official leaderboard and moves rows to pending maturity", () => {
  const response = toReadApiLeaderboardContract(
    "30d",
    [row({ period: "30d", name: "Recent Creator", total_calls: 100, accuracy_rank: 1 })],
    { now: NOW },
  );

  assert.equal(response.period, "30d");
  assert.equal(response.emptyReason, "PENDING_MATURITY");
  assert.deepEqual(response.officialRankedRows, []);
  assert.equal(response.pendingMaturityRows.length, 1);
  assert.deepEqual(response.leaderboard.rows, []);
});

test("read API response shape keeps leaderboard.rows safe", () => {
  const response = toReadApiLeaderboardContract(
    "all_time",
    [
      row({ name: "Altcoin Daily", total_calls: 429, accuracy_rank: 19 }),
      row({ name: "Valid Alpha", total_calls: 75, accuracy_rank: 4 }),
    ],
    { now: NOW },
  );

  assert.equal(response.ok, true);
  assert.equal(response.period, "all_time");
  assert.equal(response.emptyReason, null);
  assert.deepEqual(Object.keys(response.counts), [
    "publicEligibleCalls",
    "officialRankedCreators",
    "provisionalCreators",
    "watchlistCreators",
    "staleCreators",
    "excludedCreators",
    "pendingMaturityCreators",
  ]);
  assert.deepEqual(response.leaderboard, {
    period: "all_time",
    rows: response.officialRankedRows,
  });
  assert.equal(response.leaderboard.rows.some((item) => item.name === "Altcoin Daily"), false);
});

test("publicEligibleCallsWhereSql uses scored-call public predicate", () => {
  assert.equal(
    publicEligibleCallsWhereSql("calls"),
    "calls.score > 0 AND calls.extraction_confidence >= 0.70",
  );
  assert.throws(() => publicEligibleCallsWhereSql("calls; DROP TABLE calls"), /Unsafe SQL alias/);
});

test("publicVisibleCallsWhereSql preserves signed scored calls for call evidence", () => {
  assert.equal(
    publicVisibleCallsWhereSql("calls"),
    "calls.score != 0 AND calls.extraction_confidence >= 0.70",
  );
  assert.throws(() => publicVisibleCallsWhereSql("calls; DROP TABLE calls"), /Unsafe SQL alias/);
});

test("read API server wires the safety contract and does not use unsafe call predicates", () => {
  const source = readFileSync(new URL("../src/scripts/callscore-read-api-server.mjs", import.meta.url), "utf8");

  assert.match(source, /toReadApiLeaderboardContract/);
  assert.match(source, /publicEligibleCallsWhereSql\("calls"\)/);
  assert.match(source, /publicVisibleCallsWhereSql\("bc"\)/);
  assert.match(source, /publicVisibleCallsWhereSql\("wc"\)/);
  assert.match(source, /publicVisibleCallsWhereSql\("c"\)/);
  assert.match(source, /publicVisibleCallsWhereSql\("calls"\)/);
  assert.match(source, /\.\.\.board/);
  assert.match(source, /publicCounts: counts/);
  assert.doesNotMatch(source, /score\s+IS\s+NOT\s+NULL/i);
  assert.doesNotMatch(source, /extraction_confidence\s*>=\s*0\.65/i);
  assert.doesNotMatch(source, /catch\s*\{\s*return\s+\[\];\s*\}/);
});
