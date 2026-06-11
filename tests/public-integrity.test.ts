import test from "node:test";
import assert from "node:assert/strict";
import { auditExtraction } from "../src/lib/extraction-validation";
import {
  computePublicScoreComponents,
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallScoreStatus,
  getHorizonStatus,
  getScoreReadyIgnoringConfidenceSql,
  SCORE_WEIGHTS,
} from "../src/lib/public-methodology";
import {
  getLeaderboardEligibilitySql,
  getLeaderboardSampleThreshold,
  LOW_N_WARNING_CALLS,
  MIN_PRO_90D_LEADERBOARD_CALLS,
  MIN_PUBLIC_LEADERBOARD_CALLS,
  OBSOLETE_LEADERBOARD_CALL_THRESHOLD,
  getLowNWarningCalls,
  getMinimumLeaderboardCalls,
  LOW_N_90D_WARNING_CALLS,
  RECENT_CONTEXT_LOW_N_WARNING_CALLS,
  RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
} from "../src/lib/leaderboard-eligibility";
import {
  CREATOR_JUDGMENT_WINDOW_DAYS,
  CREATOR_JUDGMENT_WINDOW_LABEL,
  getJudgmentWindowSql,
  getPeriodFilterSql,
} from "../src/lib/judgment-window";
import {
  computeCreatorScoreAverages,
  serializeCall,
} from "../src/lib/public-serializer";
import { TRACKED_CREATOR_COUNT } from "../src/lib/tracked-creators";
import type { Call } from "../src/lib/types";

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
    call_date: "2025-10-11T10:43:22.000Z",
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
    created_at: "2025-10-11T10:43:22.000Z",
    ...overrides,
  };
}

test("tracked creator source of truth supports the expanded index universe", () => {
  assert.equal(TRACKED_CREATOR_COUNT, 123);
});

test("public Alpha Score equals the documented component sum", () => {
  const components = computePublicScoreComponents(
    buildCall({
      alpha_30d: 8,
      specificity_score: 0.5,
      regime_difficulty: 0.6,
      hit_target: true,
      correct_direction: true,
    }),
  );

  assert.equal(components.direction, SCORE_WEIGHTS.direction);
  assert.equal(components.alpha, 20);
  assert.equal(components.specificity, 7.5);
  assert.equal(components.regime, 6);
  assert.equal(components.target, SCORE_WEIGHTS.target);
  assert.equal(
    components.total,
    components.direction +
      components.alpha +
      components.specificity +
      components.regime +
      components.target,
  );
});

test("low-confidence calls are excluded instead of scored", () => {
  const status = getCallScoreStatus(
    {
      extraction_confidence: EXTRACTION_CONFIDENCE_THRESHOLD - 0.01,
      call_date: "2025-10-11T10:43:22.000Z",
      price_at_call: 100,
      target_price: null,
      price_30d: 110,
      price_90d: 120,
      return_30d: 10,
      hit_target: true,
    },
    new Date("2026-04-12T00:00:00.000Z"),
  );

  assert.equal(status, "excluded_confidence");
});

test("calls without entry price state stay unscored", () => {
  const status = getCallScoreStatus(
    {
      extraction_confidence: EXTRACTION_CONFIDENCE_THRESHOLD,
      call_date: "2025-10-11T10:43:22.000Z",
      price_at_call: null,
      target_price: null,
      price_30d: 110,
      price_90d: 120,
      return_30d: 10,
      hit_target: true,
    },
    new Date("2026-04-12T00:00:00.000Z"),
  );

  assert.equal(status, "pending_horizon");
});

test("future horizons remain pending until they elapse", () => {
  const now = new Date("2026-04-12T00:00:00.000Z");
  assert.equal(
    getHorizonStatus("2026-04-05T17:11:39.000Z", "30d", true, now),
    "pending",
  );
  assert.equal(
    getHorizonStatus("2026-04-05T17:11:39.000Z", "90d", true, now),
    "pending",
  );
});

test("pending 30d calls serialize as live/open when latest candle data is attached", () => {
  const liveCall = serializeCall(
    {
      ...buildCall({
        call_date: "2026-04-05T17:11:39.000Z",
        price_at_call: 100,
        btc_price_at_call: 100,
        price_30d: null,
        return_30d: null,
        alpha_30d: null,
        correct_direction: null,
        hit_target: null,
      }),
      live_price: 112,
      btc_live_price: 103,
      live_price_at: "2026-04-12 00:00:00",
      btc_live_price_at: "2026-04-12 00:00:00",
    },
    new Date("2026-04-12T00:00:00.000Z"),
  );

  assert.equal(liveCall.score_status, "pending_horizon");
  assert.equal(liveCall.is_live_open, true);
  assert.equal(liveCall.live_return, 12);
  assert.equal(liveCall.live_alpha, 9);
});

test("target parsing rejects macro figures like $12 trillion", () => {
  const audit = auditExtraction({
    symbol: "BTCUSDT",
    direction: "bullish",
    target_price: 12,
    raw_quote:
      "Breaking news, adoption continues. $12 trillion Charles Schwab to launch Bitcoin and Ethereum trading for its users this year.",
  });

  assert.equal(audit.targetPrice, null);
  assert.ok(
    audit.reasons.some((reason) => reason.includes("target price")),
  );
});

test("named sample extraction failures are caught by the validator", () => {
  const now = new Date("2026-04-12T00:00:00.000Z");

  const tao755 = auditExtraction({
    symbol: "TAOUSDT",
    direction: "bearish",
    target_price: null,
    raw_quote:
      "Tao going and showing signs of pumping, which I think is one of the best buys ever right now.",
  });
  assert.equal(tao755.isValid, false);

  const near756 = auditExtraction({
    symbol: "NEARUSDT",
    direction: "bullish",
    target_price: null,
    raw_quote:
      "Binance and FTX got together and crashed the market near the bottom of the bull run.",
  });
  assert.equal(near756.isValid, false);

  const eth5525 = auditExtraction({
    symbol: "ETHUSDT",
    direction: "bearish",
    target_price: null,
    raw_quote:
      "Wanted to touch on Ethereum as well. I do think ETH could make a push up.",
  });
  assert.equal(eth5525.isValid, false);

  const pending559 = serializeCall(
    buildCall({
      id: 559,
      direction: "bearish",
      target_price: 120,
      extraction_confidence: 1,
      call_date: "2026-04-05T17:11:39.000Z",
      price_30d: null,
      price_90d: null,
      return_30d: null,
      return_90d: null,
      hit_target: null,
    }),
    now,
  );
  assert.equal(pending559.score_status, "pending_horizon");
});

test("creator score averages reconcile with the per-call public components", () => {
  const calls = [
    buildCall({
      id: 1,
      alpha_30d: 6,
      specificity_score: 0.25,
      regime_difficulty: 0.5,
      hit_target: true,
      correct_direction: true,
    }),
    buildCall({
      id: 2,
      alpha_30d: 2,
      specificity_score: 0.5,
      regime_difficulty: 0.3,
      hit_target: false,
      correct_direction: true,
      target_price: 150,
    }),
  ];

  const averages = computeCreatorScoreAverages(calls, new Date("2026-04-12T00:00:00.000Z"));
  assert.equal(
    Number(averages.total.toFixed(1)),
    Number(
      (
        averages.direction +
        averages.alpha +
        averages.specificity +
        averages.regime +
        averages.target
      ).toFixed(1),
    ),
  );
  assert.equal(averages.scoredCount, 2);
});

test("leaderboard requires the post-audit public scored call floors", () => {
  assert.equal(OBSOLETE_LEADERBOARD_CALL_THRESHOLD, 24);
  assert.equal(MIN_PUBLIC_LEADERBOARD_CALLS, 24);
  assert.equal(LOW_N_WARNING_CALLS, 50);
  assert.equal(MIN_PRO_90D_LEADERBOARD_CALLS, 3);
  assert.equal(LOW_N_90D_WARNING_CALLS, 10);
  assert.equal(RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS, 3);
  assert.equal(RECENT_CONTEXT_LOW_N_WARNING_CALLS, 10);
  assert.equal(getMinimumLeaderboardCalls("all_time"), 24);
  assert.equal(getLowNWarningCalls("all_time"), 50);
  assert.equal(getLeaderboardEligibilitySql("cs"), "cs.total_calls >= 24");
  assert.equal(getLeaderboardEligibilitySql("cs", "all_time"), "cs.total_calls >= 24");
  assert.equal(getMinimumLeaderboardCalls("12m"), 12);
  assert.equal(getLowNWarningCalls("12m"), 25);
  assert.equal(getLeaderboardEligibilitySql("cs", "12m"), "cs.total_calls >= 12");
  assert.equal(getMinimumLeaderboardCalls("90d"), 3);
  assert.equal(getLowNWarningCalls("90d"), 10);
  assert.equal(getLeaderboardEligibilitySql("cs", "90d"), "cs.total_calls >= 3");
  assert.equal(getLeaderboardEligibilitySql("cs", "30d"), "FALSE");
});

test("leaderboard sample floors are period-aware", () => {
  assert.deepEqual(getLeaderboardSampleThreshold("all_time"), {
    min_public_scored_calls: 24,
    low_n_warning_calls: 50,
    sample_floor_label: "All-time official floor; certified at 50+ mature qualifying calls",
  });
  assert.deepEqual(getLeaderboardSampleThreshold("12m"), {
    min_public_scored_calls: 12,
    low_n_warning_calls: 25,
    sample_floor_label: "12 months · one mature qualifying call per month; certified at 25+",
  });
  assert.deepEqual(getLeaderboardSampleThreshold("90d"), {
    min_public_scored_calls: RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
    low_n_warning_calls: RECENT_CONTEXT_LOW_N_WARNING_CALLS,
    sample_floor_label: "90-day recent form; lower-confidence official floor; certified at 10+",
  });
  assert.deepEqual(getLeaderboardSampleThreshold("30d"), {
    min_public_scored_calls: RECENT_CONTEXT_MIN_PUBLIC_LEADERBOARD_CALLS,
    low_n_warning_calls: RECENT_CONTEXT_LOW_N_WARNING_CALLS,
    sample_floor_label: "30 days · pending maturity; official ranking disabled",
  });
  assert.equal(getLeaderboardEligibilitySql("cs", "90d"), "cs.total_calls >= 3");
  assert.equal(getLeaderboardEligibilitySql("cs", "30d"), "FALSE");
});

test("score-ready SQL can be reused without lowering the confidence gate", () => {
  const sql = getScoreReadyIgnoringConfidenceSql("c");
  assert.match(sql, /c\.price_at_call IS NOT NULL/);
  assert.match(sql, /c\.return_30d IS NOT NULL/);
  assert.doesNotMatch(sql, /extraction_confidence/);
});

test("creator judgment window is a rolling 12-month period", () => {
  assert.equal(CREATOR_JUDGMENT_WINDOW_DAYS, 365);
  assert.equal(CREATOR_JUDGMENT_WINDOW_LABEL, "Last 12 months");
  assert.equal(getJudgmentWindowSql("c"), "c.call_date >= NOW() - INTERVAL '365 days'");
  assert.equal(getPeriodFilterSql("c", "all_time"), "");
  assert.equal(getPeriodFilterSql("c", "12m"), "AND c.call_date >= NOW() - INTERVAL '365 days'");
  assert.equal(getPeriodFilterSql("c", "90d"), "AND c.call_date >= NOW() - INTERVAL '90 days'");
  assert.equal(getPeriodFilterSql("c", "30d"), "AND c.call_date >= NOW() - INTERVAL '30 days'");
});
