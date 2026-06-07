import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getLegacyCreatorExclusionSql,
  isLegacyCreatorExcludedFromBuyerRankings,
  LEGACY_CREATOR_OVERRIDES,
} from "../src/lib/legacy-creator-overrides";

const root = join(__dirname, "..");

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("Altcoin Daily legacy override documents audit basis", () => {
  const override = LEGACY_CREATOR_OVERRIDES.find((item) => item.youtube_handle === "@AltcoinDaily");
  assert.ok(override);
  assert.equal(override.status, "excluded_pending_review");
  assert.match(override.reason, /21\.1% genuine/);
  assert.match(override.reason, /78\.9% contaminated/);
  assert.equal(override.source, "callscore-altcoin-daily-audit-packet-2026-06-06");
  assert.equal(isLegacyCreatorExcludedFromBuyerRankings("@AltcoinDaily"), true);
  assert.equal(isLegacyCreatorExcludedFromBuyerRankings("@OtherCreator"), false);
});

test("buyer-facing leaderboard SQL excludes legacy contaminated creators", () => {
  const sql = getLegacyCreatorExclusionSql("c");
  assert.equal(sql, "LOWER(c.youtube_handle) NOT IN ('@altcoindaily')");

  for (const file of [
    "src/app/api/leaderboard/route.ts",
    "src/app/api/v1/leaderboard/route.ts",
    "src/app/page.tsx",
    "src/scripts/leaderboard.ts",
  ]) {
    assert.match(source(file), /getLegacyCreatorExclusionSql/);
  }
});

test("leaderboard route ranks are still sequential after filtering", () => {
  const route = source("src/app/api/leaderboard/route.ts");
  assert.match(route, /const rank = index \+ 1;/);
  assert.doesNotMatch(route, /const rank = row\.accuracy_rank \?\? index \+ 1;/);
});

test("creator admission gate does not add DB migrations or recompute paths", () => {
  assert.doesNotMatch(source("src/scripts/promote-creator-candidates.ts"), /DELETE FROM|UPDATE calls|compute-scores|recompute/i);
  assert.doesNotMatch(source("src/lib/legacy-creator-overrides.ts"), /DELETE FROM|UPDATE calls|compute-scores|recompute/i);
});

test("30d stays API-only experimental, not a serious buyer-facing homepage option", () => {
  assert.doesNotMatch(source("src/components/PeriodFilter.tsx"), /30 days/);
  assert.match(source("src/app/api/leaderboard/route.ts"), /"30d"/);
  assert.match(source("src/app/api/v1/leaderboard/route.ts"), /"30d"/);
});
