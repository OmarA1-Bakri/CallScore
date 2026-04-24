import test from "node:test";
import assert from "node:assert/strict";
import { auditExtraction } from "../src/lib/extraction-validation";
import {
  computePublicScoreComponents,
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallScoreStatus,
  getHorizonStatus,
  SCORE_WEIGHTS,
} from "../src/lib/public-methodology";
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
  assert.equal(TRACKED_CREATOR_COUNT, 53);
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
