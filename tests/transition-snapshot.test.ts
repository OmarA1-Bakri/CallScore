import assert from "node:assert/strict";
import test from "node:test";
import { buildTransitionSnapshots, periodStartFor } from "../src/lib/transition/transition-snapshot";
import type { TransitionCallRow, TransitionCreatorRow } from "../src/lib/transition/transition-schemas";

const creators: TransitionCreatorRow[] = [
  { creator_id: 1, creator_name: "Eligible Caller", youtube_handle: "@caller", focus: "EN / Global / creator calls" },
  { creator_id: 2, creator_name: "News Desk", youtube_handle: "@news", focus: "Crypto journalism, market structure, major ecosystem interviews" },
];

function call(partial: Partial<TransitionCallRow> & Pick<TransitionCallRow, "creator_id" | "call_id" | "call_date">): TransitionCallRow {
  const creator = creators.find((item) => item.creator_id === partial.creator_id)!;
  return {
    ...creator,
    call_id: partial.call_id,
    call_date: partial.call_date,
    symbol: partial.symbol ?? "BTCUSDT",
    direction: partial.direction ?? "bullish",
    extraction_confidence: partial.extraction_confidence ?? 0.9,
    specificity_score: partial.specificity_score ?? 0.25,
    score: partial.score ?? 20,
    alpha_30d: partial.alpha_30d ?? 1,
    return_30d: partial.return_30d ?? 5,
    correct_direction: partial.correct_direction ?? true,
    price_at_call: partial.price_at_call ?? 100,
    price_30d: partial.price_30d ?? 105,
    target_price: partial.target_price ?? null,
    price_90d: partial.price_90d ?? null,
    hit_target: partial.hit_target ?? null,
  };
}

test("builds monthly snapshots from raw call rows and excludes news/media creators", () => {
  const result = buildTransitionSnapshots({
    creators,
    period: "monthly",
    rows: [
      call({ creator_id: 1, call_id: 1, call_date: "2026-01-05T00:00:00Z", score: 30 }),
      call({ creator_id: 1, call_id: 2, call_date: "2026-01-12T00:00:00Z", direction: "bearish", score: 10, correct_direction: false }),
      call({ creator_id: 2, call_id: 3, call_date: "2026-01-12T00:00:00Z", score: 50 }),
    ],
  });
  assert.equal(result.snapshots.length, 1);
  assert.equal(result.snapshots[0].creator_id, 1);
  assert.equal(result.snapshots[0].period_start, "2026-01-01");
  assert.equal(result.snapshots[0].calls_count, 2);
  assert.equal(result.snapshots[0].score_ready_calls, 2);
  assert.equal(result.snapshots[0].win_rate, 0.5);
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].creator_id, 2);
});

test("periodStartFor supports weekly, monthly, and quarterly periods", () => {
  const date = new Date("2026-05-20T12:00:00Z");
  assert.equal(periodStartFor(date, "weekly").toISOString().slice(0, 10), "2026-05-18");
  assert.equal(periodStartFor(date, "monthly").toISOString().slice(0, 10), "2026-05-01");
  assert.equal(periodStartFor(date, "quarterly").toISOString().slice(0, 10), "2026-04-01");
});

test("snapshot builder does not require or reference creator_stats.30d", () => {
  const source = buildTransitionSnapshots.toString();
  assert.equal(source.includes("creator_stats.30d"), false);
  assert.equal(source.includes("creator_stats"), false);
});
