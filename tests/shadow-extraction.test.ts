import test from "node:test";
import assert from "node:assert/strict";
import {
  callComparisonSignature,
  diffVideoShadow,
  hashTranscript,
  summarizeCallForDiff,
} from "../src/lib/shadow-extraction";
import type { NormalizedExtractedCall } from "../src/lib/ai-extraction";
import type { ExistingCallSnapshot } from "../src/lib/shadow-extraction";

function call(overrides: Partial<NormalizedExtractedCall> = {}): NormalizedExtractedCall {
  return {
    symbol: "BTCUSDT",
    direction: "bullish",
    call_type: "buy",
    entry_price: 100,
    target_price: 120,
    stop_loss: null,
    timeframe: "30 days",
    confidence: "high",
    strategy_type: "technical_analysis",
    raw_quote: "Bitcoin can run to 120 if it holds 100",
    extraction_confidence: 0.9,
    specificity_score: 0.8,
    validation_notes: [],
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingCallSnapshot> = {}): ExistingCallSnapshot {
  const base = call(overrides as Partial<NormalizedExtractedCall>);
  return {
    symbol: base.symbol,
    direction: base.direction,
    call_type: base.call_type,
    entry_price: base.entry_price,
    target_price: base.target_price,
    stop_loss: base.stop_loss,
    timeframe: base.timeframe,
    confidence: base.confidence,
    strategy_type: base.strategy_type,
    raw_quote: base.raw_quote,
    extraction_confidence: base.extraction_confidence,
    specificity_score: base.specificity_score,
    ...overrides,
  };
}

test("hashTranscript is deterministic sha256", () => {
  assert.equal(hashTranscript("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("callComparisonSignature ignores confidence-only scoring changes", () => {
  assert.equal(
    callComparisonSignature(call({ extraction_confidence: 0.95, confidence: "high" })),
    callComparisonSignature(existing({ extraction_confidence: 0.7, confidence: "medium" })),
  );
});

test("diffVideoShadow classifies unchanged, new, removed, changed, and manual review", () => {
  assert.equal(diffVideoShadow([existing()], [call()]).status, "unchanged");
  assert.equal(diffVideoShadow([], [call()]).status, "new_calls");
  assert.equal(diffVideoShadow([existing()], []).status, "removed_calls");
  assert.equal(diffVideoShadow([existing()], [call({ target_price: 130 })]).status, "changed_calls");
  assert.equal(diffVideoShadow([], []).status, "no_accepted_calls");
  assert.equal(diffVideoShadow([existing()], [call()], ["missing_exact_published_at"]).status, "manual_review");
});

test("summarizeCallForDiff emits compact non-secret diff text", () => {
  assert.match(summarizeCallForDiff(call({ symbol: "ETHUSDT", target_price: 4000 })), /^ETHUSDT bullish buy target=4000 ::/);
});
