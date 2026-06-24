import assert from "node:assert/strict";
import test from "node:test";
import { classifyTransitionSnapshot } from "../src/lib/transition/transition-state-classifier";
import type { CreatorTransitionSnapshot } from "../src/lib/transition/transition-schemas";

function snap(overrides: Partial<CreatorTransitionSnapshot> = {}): CreatorTransitionSnapshot {
  return {
    creator_id: 1,
    creator_name: "Creator",
    youtube_handle: "@creator",
    period: "monthly",
    period_start: "2026-01-01",
    period_end: "2026-01-31",
    calls_count: 10,
    score_ready_calls: 10,
    win_rate: 0.5,
    avg_score: 12,
    avg_alpha_30d: 0,
    avg_return_30d: 0,
    bullish_pct: 0.5,
    bearish_pct: 0.5,
    symbol_diversity: 3,
    specificity_avg: 0.2,
    extraction_confidence_avg: 0.9,
    score_stddev: 5,
    alpha_spread: 5,
    latest_call_at: "2026-01-20T00:00:00.000Z",
    activity_status: "active",
    eligibility_status: "eligible",
    excluded_reason: null,
    ...overrides,
  };
}

test("classifies insufficient data and directional bias risk", () => {
  assert.equal(classifyTransitionSnapshot(snap({ score_ready_calls: 2 })).state, "INSUFFICIENT_DATA");
  assert.equal(classifyTransitionSnapshot(snap({ bullish_pct: 0.9, calls_count: 12 })).state, "DIRECTIONAL_BIAS_RISK");
});

test("classifies volatility, hot, cold, deterioration, recovery, and stable states", () => {
  assert.equal(classifyTransitionSnapshot(snap({ score_stddev: 20 })).state, "HIGH_VOLATILITY");
  assert.equal(classifyTransitionSnapshot(snap({ win_rate: 0.7, avg_score: 25 }), undefined, snap({ win_rate: 0.45, avg_score: 10 })).state, "HOT_STREAK");
  assert.equal(classifyTransitionSnapshot(snap({ win_rate: 0.2, avg_score: 3 }), undefined, snap({ win_rate: 0.5, avg_score: 12 })).state, "COLD_STREAK");
  assert.equal(classifyTransitionSnapshot(snap({ win_rate: 0.2, avg_score: 4 }), snap({ win_rate: 0.6, avg_score: 15 })).state, "DETERIORATING");
  assert.equal(classifyTransitionSnapshot(snap({ avg_score: 14 }), snap({ avg_score: 4 }), snap({ avg_score: 10 })).state, "RECOVERING");
  assert.equal(classifyTransitionSnapshot(snap()).state, "STABLE_PERFORMER");
});

test("classifies provisional and stale states", () => {
  assert.equal(classifyTransitionSnapshot(snap({ calls_count: 0, score_ready_calls: 0 })).state, "STALE_OR_INACTIVE");
  assert.equal(classifyTransitionSnapshot(snap({ calls_count: 6, score_ready_calls: 6 })).state, "PROVISIONAL_SIGNAL");
});
