import assert from "node:assert/strict";
import test from "node:test";
import { backtestTransitionStates } from "../src/lib/transition/transition-backtest";
import type { CreatorTransitionSnapshot, CreatorTransitionStateRecord } from "../src/lib/transition/transition-schemas";

function snapshot(period_start: string, score: number, win = 0.5): CreatorTransitionSnapshot {
  return {
    creator_id: 1,
    creator_name: "Creator",
    youtube_handle: "@creator",
    period: "monthly",
    period_start,
    period_end: period_start,
    calls_count: 10,
    score_ready_calls: 10,
    win_rate: win,
    avg_score: score,
    avg_alpha_30d: score / 10,
    avg_return_30d: score / 5,
    bullish_pct: 0.5,
    bearish_pct: 0.5,
    symbol_diversity: 2,
    specificity_avg: 0.2,
    extraction_confidence_avg: 0.9,
    score_stddev: 5,
    alpha_spread: 5,
    latest_call_at: null,
    activity_status: "active",
    eligibility_status: "eligible",
    excluded_reason: null,
  };
}

function state(period_start: string, score: number, label: CreatorTransitionStateRecord["state"]): CreatorTransitionStateRecord {
  const s = snapshot(period_start, score);
  return { creator_id: 1, creator_name: "Creator", youtube_handle: "@creator", period_start, period_end: period_start, state: label, confidence: 0.7, drivers: [], warnings: [], snapshot: s };
}

test("backtest links state at period t to period t+1 metrics", () => {
  const report = backtestTransitionStates([
    state("2026-01-01", 10, "HOT_STREAK"),
    state("2026-02-01", 20, "STABLE_PERFORMER"),
    state("2026-03-01", 5, "COLD_STREAK"),
  ]);
  const hot = report.buckets.find((bucket) => bucket.state === "HOT_STREAK");
  assert.ok(hot);
  assert.equal(hot.next_periods, 1);
  assert.equal(hot.avg_next_score, 20);
  assert.match(report.summary, /descriptive|weak signal/);
});
