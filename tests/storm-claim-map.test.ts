import assert from "node:assert/strict";
import test from "node:test";
import { buildStormClaimMap, blockedClaims, safeClaims } from "../src/lib/storm/storm-claim-map";
import { buildStormContradictions } from "../src/lib/storm/storm-perspectives";
import type { StormEvidencePack } from "../src/lib/storm/storm-schemas";

function pack(): StormEvidencePack {
  return {
    creator_id: 1,
    creator_name: "Creator A",
    youtube_handle: "@creatorA",
    state: "HOT_STREAK",
    confidence: 0.75,
    period_start: "2026-03-01",
    period_end: "2026-03-31",
    movement_drivers: ["win_rate=0.8, avg_score=42"],
    selected_transition: {
      creator_id: 1,
      creator_name: "Creator A",
      youtube_handle: "@creatorA",
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      state: "HOT_STREAK",
      confidence: 0.75,
      drivers: ["win_rate=0.8, avg_score=42"],
      warnings: [],
      snapshot: { creator_id: 1, creator_name: "Creator A", youtube_handle: "@creatorA", period: "monthly", period_start: "2026-03-01", period_end: "2026-03-31", calls_count: 8, score_ready_calls: 8, win_rate: 0.8, avg_score: 42, avg_alpha_30d: 3, avg_return_30d: 10, bullish_pct: 0.6, bearish_pct: 0.4, symbol_diversity: 3, specificity_avg: 0.2, extraction_confidence_avg: 0.9, score_stddev: 7, alpha_spread: 12, latest_call_at: null, activity_status: "active", eligibility_status: "eligible", excluded_reason: null },
    },
    supporting_calls: [{ call_id: 10, video_id: 100, symbol: "BTCUSDT", direction: "bullish", call_date: "2026-03-10", raw_quote: "I am buying BTC here", score: 48, alpha_30d: 5, return_30d: 12, correct_direction: true, extraction_confidence: 0.92, source_table: "calls" }],
    contradicting_calls: [{ call_id: 11, video_id: 101, symbol: "ETHUSDT", direction: "bullish", call_date: "2026-03-12", raw_quote: "ETH looks strong", score: 8, alpha_30d: -4, return_30d: -8, correct_direction: false, extraction_confidence: 0.88, source_table: "calls" }],
    recent_videos: [],
    quote_evidence: [{ call_id: 10, quote: "I am buying BTC here", source_table: "calls", confidence: 0.92 }],
    market_context: [],
    context_sources: [],
    warnings: [],
  };
}

test("maps every supported public-safe claim to evidence and blocks unsupported prediction claims", () => {
  const claims = buildStormClaimMap(pack());
  const safe = claims.filter((claim) => claim.public_safe);
  assert.ok(safe.length > 0);
  assert.ok(safe.every((claim) => claim.source_id !== null));
  assert.ok(blockedClaims(claims).some((claim) => /will outperform/.test(claim)));
  assert.ok(safeClaims(claims).some((claim) => /descriptive/.test(claim)));
});

test("contradictions explain evidence that weakens the state story", () => {
  const contradictions = buildStormContradictions(pack());
  assert.ok(contradictions.some((item) => item.source_table_or_artifact === "calls"));
  assert.ok(contradictions.every((item) => item.explanation.length > 0));
});
