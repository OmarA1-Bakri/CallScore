import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCreatorStatsHardExclusionSql,
  getCreatorStatsOfficialEligibilitySql,
  getCreatorStatsCertifiedThreshold,
  getCreatorStatsOfficialThreshold,
  getCreatorStatsProvisionalThreshold,
  getCreatorStatsSamplePriorN,
  sampleAdjustedCreatorScore,
} from "../src/lib/creator-stats-eligibility";

const root = join(__dirname, "..");

test("creator_stats official thresholds match public safety contract", () => {
  assert.equal(getCreatorStatsOfficialThreshold("all_time"), 24);
  assert.equal(getCreatorStatsOfficialThreshold("12m"), 12);
  assert.equal(getCreatorStatsOfficialThreshold("90d"), 3);
  assert.equal(getCreatorStatsOfficialThreshold("30d"), null);
  assert.equal(getCreatorStatsCertifiedThreshold("all_time"), 50);
  assert.equal(getCreatorStatsCertifiedThreshold("12m"), 25);
  assert.equal(getCreatorStatsCertifiedThreshold("90d"), 10);
  assert.equal(getCreatorStatsProvisionalThreshold("all_time"), 6);
  assert.equal(getCreatorStatsProvisionalThreshold("12m"), 6);
  assert.equal(getCreatorStatsProvisionalThreshold("90d"), 1);
});

test("creator_stats source exclusion SQL hard-blocks policy-excluded identities", () => {
  const sql = getCreatorStatsHardExclusionSql("cr");
  assert.match(sql, /altcoin daily/);
  assert.match(sql, /altcoindaily/);
  assert.match(sql, /ucblhgkvy-bjpcawebgtnfbw/);
  assert.match(sql, /alexbeckerschannel/);
  assert.match(sql, /moneyzg/);
  assert.match(sql, /cryptoinspector/);
});

test("creator_stats official eligibility requires threshold, freshness, period validity, and exclusion", () => {
  const sql = getCreatorStatsOfficialEligibilitySql({
    statsAlias: "cs_inner",
    creatorAlias: "cr_inner",
    freshnessAlias: "vf",
  });
  assert.match(sql, /cs_inner\.total_calls > 0/);
  assert.match(sql, /WHEN cs_inner\.period = 'all_time' THEN 24/);
  assert.match(sql, /WHEN cs_inner\.period = '12m' THEN 12/);
  assert.match(sql, /WHEN cs_inner\.period = '90d' THEN 3/);
  assert.match(sql, /cs_inner\.period <> '30d'/);
  assert.match(sql, /vf\.latest_video_date >= NOW\(\) - INTERVAL '180 days'/);
  assert.match(sql, /cr_inner\.youtube_handle/);
});

test("recomputeCreatorStats ranks through creator and freshness joins, not raw creator_stats only", () => {
  const source = readFileSync(join(root, "src/lib/recompute-stats.ts"), "utf8");
  assert.match(source, /getCreatorStatsOfficialEligibilitySql/);
  assert.match(source, /JOIN creators cr_inner ON cr_inner\.id = cs_inner\.creator_id/);
  assert.match(source, /MAX\(published_at\) AS latest_video_date/);
  assert.match(source, /if \(officialThreshold === null \|\| priorN === null\) return;/);
  assert.match(source, /WITH baseline/);
  assert.match(source, /sample-adjusted/i);
  assert.doesNotMatch(source, /getLeaderboardEligibilitySql\("creator_stats"/);
});


test("sample-adjusted creator score shrinks low-N scores toward the baseline", () => {
  assert.equal(getCreatorStatsSamplePriorN("12m"), 25);
  const lowN = sampleAdjustedCreatorScore(80, 12, 50, 25);
  const highN = sampleAdjustedCreatorScore(80, 50, 50, 25);
  assert.ok(lowN < highN);
  assert.ok(lowN > 50);
  assert.ok(highN < 80);
});
