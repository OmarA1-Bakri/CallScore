import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  CALL_SCORE_LIFECYCLE_STATES,
  CREATOR_RANKING_STATES,
  CURRENT_CREATOR_RANKING_METHOD,
  OFFICIAL_CREATOR_THRESHOLDS,
  RECOMMENDED_CREATOR_RANK_SCORE_V2,
} from "../src/lib/methodology-rubric";
import { read } from "./page-helpers";

test("methodology rubric separates call lifecycle from score value", () => {
  const states = CALL_SCORE_LIFECYCLE_STATES.map((state) => state.state);
  assert.deepEqual(states, [
    "raw_candidate",
    "confidence_pass",
    "matched",
    "pending_maturity",
    "scored",
    "excluded",
    "invalid",
  ]);
  assert.match(
    CALL_SCORE_LIFECYCLE_STATES.find((state) => state.state === "scored")?.definition ?? "",
    /0–100 Call Score/,
  );
});

test("methodology rubric defines every public-safe creator bucket", () => {
  const buckets = CREATOR_RANKING_STATES.map((state) => state.bucket);
  assert.deepEqual(buckets, [
    "officialRankedRows",
    "provisionalRows",
    "watchlistRows",
    "staleRows",
    "excludedRows",
    "pendingMaturityRows",
  ]);
});

test("official thresholds match the commercial-safety read contract", () => {
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS.all_time.officialMinCalls, 24);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS.all_time.certifiedMinCalls, 50);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS["12m"].officialMinCalls, 12);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS["12m"].certifiedMinCalls, 25);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS["90d"].officialMinCalls, 3);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS["90d"].certifiedMinCalls, 10);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS["30d"].officialEnabled, false);
  assert.equal(OFFICIAL_CREATOR_THRESHOLDS["30d"].emptyReason, "PENDING_MATURITY");
});

test("current creator rank method documents legacy alpha_score naming risk", () => {
  assert.equal(CURRENT_CREATOR_RANKING_METHOD.scoreField, "creator_stats.alpha_score");
  assert.match(CURRENT_CREATOR_RANKING_METHOD.currentMeaning, /average 0–100 Call Score/);
  assert.ok(
    CURRENT_CREATOR_RANKING_METHOD.limitations.some((limitation) =>
      limitation.includes("not raw average alpha"),
    ),
  );
});

test("sample-adjusted rank formula is recompute gated", () => {
  assert.match(RECOMMENDED_CREATOR_RANK_SCORE_V2.approvalGate, /source-safe stats writer/);
  assert.equal(
    RECOMMENDED_CREATOR_RANK_SCORE_V2.components.reduce(
      (sum, component) => sum + component.weight,
      0,
    ),
    100,
  );
});

test("public methodology page explains bucketed official ranking contract", () => {
  const src = read("src/app/methodology/page.tsx");
  assert.match(src, /Call Score ≠ Creator Rank Score/);
  assert.match(src, /CREATOR_RANKING_STATES/);
  for (const bucket of [
    "officialRankedRows",
    "provisionalRows",
    "watchlistRows",
    "staleRows",
    "excludedRows",
    "pendingMaturityRows",
  ]) {
    assert.ok(
      CREATOR_RANKING_STATES.some((state) => state.bucket === bucket),
      `${bucket} must be defined in the rendered methodology state model`,
    );
  }
  assert.match(src, /PENDING_MATURITY/);
  assert.match(src, /sample-adjusted Creator Rank Score/);
  assert.match(src, /certified/);
  assert.doesNotMatch(src, /Avg Alpha across scored calls/);
  assert.doesNotMatch(src, /open source/);
});


test("public rank copy does not present creator rank as average alpha", () => {
  const homepage = read("src/app/page.tsx");
  const creatorPage = read("src/app/creator/[handle]/page.tsx");
  const methodologyPage = read("src/app/methodology/page.tsx");

  assert.doesNotMatch(creatorPage, /on average alpha/);
  assert.doesNotMatch(methodologyPage, /Avg Alpha across scored calls/);
  assert.match(homepage, /<span>score<\/span>/);
});
