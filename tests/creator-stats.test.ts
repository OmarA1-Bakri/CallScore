import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCreatorAvgAlpha30d,
  computeCreatorHitRate,
  computeCreatorScoreAverages,
  computeCreatorWinRate,
} from "../src/lib/public-serializer";
import type { Call } from "../src/lib/types";

// A "scored" call in the fixture is >30 days old with all required horizon
// data populated. We pin "now" forward in time so calls dated 2025-01-01
// comfortably cross the 30d (and 90d when target_price is set) horizons.
const NOW = new Date("2025-06-01T00:00:00.000Z");

function buildCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 1,
    creator_id: 1,
    video_id: 1,
    symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "buy",
    entry_price: null,
    target_price: null,
    stop_loss: null,
    timeframe: null,
    confidence: "medium",
    strategy_type: "narrative",
    raw_quote: "Bitcoin could push up from here.",
    extraction_confidence: 0.85,
    specificity_score: 0.25,
    call_date: "2025-01-01T00:00:00.000Z",
    price_at_call: 100,
    btc_price_at_call: 100,
    price_7d: 105,
    price_30d: 110,
    price_90d: 120,
    btc_price_7d: 101,
    btc_price_30d: 102,
    btc_price_90d: 103,
    return_7d: 5,
    return_30d: 10,
    return_90d: 20,
    alpha_7d: 4,
    alpha_30d: 8,
    alpha_90d: 17,
    hit_target: true,
    correct_direction: true,
    regime_at_call: 4,
    regime_difficulty: 0.7,
    score: 0,
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// An unscored call (too recent — horizon not yet elapsed) that should be
// ignored by every live creator aggregate.
function buildUnscoredCall(overrides: Partial<Call> = {}): Call {
  return buildCall({
    id: 999,
    call_date: "2025-05-30T00:00:00.000Z",
    price_30d: null,
    return_30d: null,
    price_90d: null,
    hit_target: null,
    ...overrides,
  });
}

test("computeCreatorWinRate returns 0 for no calls", () => {
  assert.equal(computeCreatorWinRate([], NOW), 0);
});

test("computeCreatorWinRate returns 1 when every scored call is profitable", () => {
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 10 }),
    buildCall({ id: 2, return_30d: 0.5 }),
  ];
  assert.equal(computeCreatorWinRate(calls, NOW), 1);
});

test("computeCreatorWinRate returns the fraction of directionally correct scored calls", () => {
  const calls: Call[] = [
    buildCall({ id: 1, correct_direction: true, return_30d: 10 }),
    buildCall({ id: 2, correct_direction: false, return_30d: -5 }),
    buildCall({ id: 3, correct_direction: false, return_30d: 0 }),
    buildCall({ id: 4, correct_direction: true, return_30d: 2 }),
  ];
  // 2 wins / 4 scored = 0.5
  assert.equal(computeCreatorWinRate(calls, NOW), 0.5);
});

test("computeCreatorWinRate ignores unscored (pending-horizon) calls", () => {
  const calls: Call[] = [
    buildCall({ id: 1, return_30d: 10 }),
    buildUnscoredCall({ id: 2 }),
  ];
  // Only the scored call counts → 1/1 = 1
  assert.equal(computeCreatorWinRate(calls, NOW), 1);
});

test("computeCreatorAvgAlpha30d returns 0 for no calls", () => {
  assert.equal(computeCreatorAvgAlpha30d([], NOW), 0);
});

test("computeCreatorAvgAlpha30d averages alpha_30d across scored calls", () => {
  const calls: Call[] = [
    buildCall({ id: 1, alpha_30d: 10 }),
    buildCall({ id: 2, alpha_30d: 20 }),
    buildCall({ id: 3, alpha_30d: -6 }),
  ];
  // (10 + 20 + -6) / 3 = 8
  assert.equal(computeCreatorAvgAlpha30d(calls, NOW), 8);
});

test("computeCreatorAvgAlpha30d ignores unscored calls", () => {
  const calls: Call[] = [
    buildCall({ id: 1, alpha_30d: 10 }),
    buildUnscoredCall({ id: 2, alpha_30d: 10000 }),
  ];
  assert.equal(computeCreatorAvgAlpha30d(calls, NOW), 10);
});

test("computeCreatorHitRate returns 0 for no calls", () => {
  assert.equal(computeCreatorHitRate([], NOW), 0);
});

test("computeCreatorHitRate returns the fraction of scored calls that hit the target", () => {
  const calls: Call[] = [
    buildCall({ id: 1, target_price: 200, hit_target: true }),
    buildCall({ id: 2, target_price: 200, hit_target: false }),
    buildCall({ id: 3, target_price: 200, hit_target: true }),
    buildCall({ id: 4, target_price: 200, hit_target: false }),
  ];
  assert.equal(computeCreatorHitRate(calls, NOW), 0.5);
});

test("computeCreatorHitRate treats null hit_target as a miss among scored calls", () => {
  const calls: Call[] = [
    buildCall({ id: 1, target_price: null, hit_target: null }),
    buildCall({ id: 2, target_price: 200, hit_target: true }),
  ];
  // 1 hit / 2 scored
  assert.equal(computeCreatorHitRate(calls, NOW), 0.5);
});

test("computeCreatorScoreAverages.total matches the averaged sum of the five components", () => {
  // Regression test for the hero/breakdown mismatch bug.
  const calls: Call[] = [
    buildCall({
      id: 1,
      correct_direction: true,
      alpha_30d: 8,
      specificity_score: 0.3,
      regime_difficulty: 0.5,
      hit_target: true,
    }),
    buildCall({
      id: 2,
      correct_direction: false,
      alpha_30d: 2,
      specificity_score: 0.1,
      regime_difficulty: 0.9,
      hit_target: false,
    }),
    buildCall({
      id: 3,
      correct_direction: true,
      alpha_30d: 4,
      specificity_score: 0.8,
      regime_difficulty: 0.3,
      hit_target: true,
    }),
  ];

  const averages = computeCreatorScoreAverages(calls, NOW);
  const componentSum =
    averages.direction +
    averages.alpha +
    averages.specificity +
    averages.regime +
    averages.target;

  // Both sides are floats; compare with a tight tolerance.
  assert.ok(
    Math.abs(averages.total - componentSum) < 1e-9,
    `expected total (${averages.total}) to equal sum of components (${componentSum})`,
  );
  assert.equal(averages.scoredCount, 3);
});
