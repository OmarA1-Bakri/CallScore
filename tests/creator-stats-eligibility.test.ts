import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCreatorStatsHardExclusionSql,
  getCreatorStatsOfficialEligibilitySql,
  getCreatorStatsOfficialThreshold,
} from "../src/lib/creator-stats-eligibility";

const root = join(__dirname, "..");

test("creator_stats official thresholds match public safety contract", () => {
  assert.equal(getCreatorStatsOfficialThreshold("all_time"), 50);
  assert.equal(getCreatorStatsOfficialThreshold("90d"), 25);
  assert.equal(getCreatorStatsOfficialThreshold("30d"), null);
});

test("creator_stats source exclusion SQL hard-blocks Altcoin Daily identities", () => {
  const sql = getCreatorStatsHardExclusionSql("cr");
  assert.match(sql, /altcoin daily/);
  assert.match(sql, /altcoindaily/);
  assert.match(sql, /ucblhgkvy-bjpcawebgtnfbw/);
});

test("creator_stats official eligibility requires threshold, freshness, period validity, and exclusion", () => {
  const sql = getCreatorStatsOfficialEligibilitySql({
    statsAlias: "cs_inner",
    creatorAlias: "cr_inner",
    freshnessAlias: "vf",
  });
  assert.match(sql, /cs_inner\.total_calls > 0/);
  assert.match(sql, /WHEN cs_inner\.period = 'all_time' THEN 50/);
  assert.match(sql, /WHEN cs_inner\.period = '90d' THEN 25/);
  assert.match(sql, /cs_inner\.period <> '30d'/);
  assert.match(sql, /vf\.latest_video_date >= NOW\(\) - INTERVAL '180 days'/);
  assert.match(sql, /cr_inner\.youtube_handle/);
});

test("recomputeCreatorStats ranks through creator and freshness joins, not raw creator_stats only", () => {
  const source = readFileSync(join(root, "src/lib/recompute-stats.ts"), "utf8");
  assert.match(source, /getCreatorStatsOfficialEligibilitySql/);
  assert.match(source, /JOIN creators cr_inner ON cr_inner\.id = cs_inner\.creator_id/);
  assert.match(source, /MAX\(published_at\) AS latest_video_date/);
  assert.match(source, /if \(officialThreshold === null\) return;/);
  assert.doesNotMatch(source, /getLeaderboardEligibilitySql\("creator_stats"/);
});
