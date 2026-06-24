import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildStormYoutubeContext } from "../src/lib/storm/storm-youtube-context";
import { loadStormVideoPlanningContext } from "../src/video/data/storm-video-context";
import type { StormClaimMapRecord, StormEvidencePack } from "../src/lib/storm/storm-schemas";

const pack = {
  creator_id: 1,
  creator_name: "Creator A",
  youtube_handle: "@creatorA",
  state: "HIGH_VOLATILITY",
  confidence: 0.72,
  period_start: "2026-03-01",
  period_end: "2026-03-31",
  movement_drivers: ["score_stddev=20"],
  selected_transition: { creator_id: 1, creator_name: "Creator A", youtube_handle: "@creatorA", period_start: "2026-03-01", period_end: "2026-03-31", state: "HIGH_VOLATILITY", confidence: 0.72, drivers: ["score_stddev=20"], warnings: [], snapshot: { creator_id: 1, creator_name: "Creator A", youtube_handle: "@creatorA", period: "monthly", period_start: "2026-03-01", period_end: "2026-03-31", calls_count: 8, score_ready_calls: 8, win_rate: 0.5, avg_score: 20, avg_alpha_30d: 0, avg_return_30d: 0, bullish_pct: 0.5, bearish_pct: 0.5, symbol_diversity: 3, specificity_avg: 0.2, extraction_confidence_avg: 0.9, score_stddev: 20, alpha_spread: 40, latest_call_at: null, activity_status: "active", eligibility_status: "eligible", excluded_reason: null } },
  supporting_calls: [{ call_id: 10, video_id: 100, symbol: "BTCUSDT", direction: "bullish", call_date: "2026-03-10", raw_quote: "I am buying BTC here", score: 48, alpha_30d: 5, return_30d: 12, correct_direction: true, extraction_confidence: 0.92, source_table: "calls" }],
  contradicting_calls: [],
  recent_videos: [],
  quote_evidence: [],
  market_context: [],
  context_sources: [],
  warnings: ["some calls are not score-ready"],
} satisfies StormEvidencePack;

const claims: StormClaimMapRecord[] = [
  { claim: "Creator A has a descriptive HIGH_VOLATILITY state", claim_type: "transition", evidence_type: "transition_artifact", source_table_or_artifact: "transition_state_artifact", source_id: "1:2026-03-01", confidence: 0.72, public_safe: true, blocked_reason: null },
  { claim: "Creator A will outperform", claim_type: "blocked", evidence_type: "none", source_table_or_artifact: "none", source_id: null, confidence: 0, public_safe: false, blocked_reason: "prediction" },
];

test("produces YouTube context without provider or publish side effects", () => {
  const ctx = buildStormYoutubeContext({ pack, claims, contradictions: [] });
  assert.ok(ctx.hook_options[0].includes("Creator A"));
  assert.ok(ctx.evidence_bullets.length > 0);
  assert.ok(ctx.blocked_claims.includes("Creator A will outperform"));
  assert.ok(ctx.risk_notes.some((note) => /future performance|score-ready/.test(note)));
});

test("video planning helper reads youtube_context artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "storm-youtube-"));
  const path = join(dir, "youtube_context.json");
  writeFileSync(path, JSON.stringify(buildStormYoutubeContext({ pack, claims, contradictions: [] })));
  const planning = loadStormVideoPlanningContext(path);
  assert.ok(planning.hook.includes("Creator A"));
  assert.ok(planning.blocked_claims.length > 0);
  rmSync(dir, { recursive: true, force: true });
});
