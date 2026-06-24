import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildStormEvidencePack, loadTransitionStatesArtifact, selectStormTransition } from "../src/lib/storm/storm-evidence-loader";
import { buildStormContradictions } from "../src/lib/storm/storm-perspectives";
import type { CreatorTransitionStateRecord } from "../src/lib/transition/transition-schemas";

function transition(overrides: Partial<CreatorTransitionStateRecord> = {}): CreatorTransitionStateRecord {
  return {
    creator_id: 1,
    creator_name: "Creator A",
    youtube_handle: "@creatorA",
    period_start: "2026-03-01",
    period_end: "2026-03-31",
    state: "HOT_STREAK",
    confidence: 0.75,
    drivers: ["win_rate=0.8, avg_score=42"],
    warnings: [],
    snapshot: {
      creator_id: 1,
      creator_name: "Creator A",
      youtube_handle: "@creatorA",
      period: "monthly",
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      calls_count: 8,
      score_ready_calls: 8,
      win_rate: 0.8,
      avg_score: 42,
      avg_alpha_30d: 3,
      avg_return_30d: 10,
      bullish_pct: 0.6,
      bearish_pct: 0.4,
      symbol_diversity: 3,
      specificity_avg: 0.2,
      extraction_confidence_avg: 0.9,
      score_stddev: 7,
      alpha_spread: 12,
      latest_call_at: "2026-03-20T00:00:00.000Z",
      activity_status: "active",
      eligibility_status: "eligible",
      excluded_reason: null,
    },
    ...overrides,
  };
}

function fakeQuery(news = false): <T>(sql: string) => Promise<T[]> {
  return async <T>(sql: string): Promise<T[]> => {
    if (sql.includes("FROM creators")) return [{ creator_id: 1, creator_name: news ? "News Desk" : "Creator A", youtube_handle: "@creatorA", focus: news ? "crypto news and journalism" : "creator calls" }] as T[];
    if (sql.includes("FROM calls")) return [
      { call_id: 10, video_id: 100, symbol: "BTCUSDT", direction: "bullish", call_date: "2026-03-10", raw_quote: "I am buying BTC here", score: 48, alpha_30d: 5, return_30d: 12, correct_direction: true, extraction_confidence: 0.92, source_table: "calls", video_title: "BTC plan", youtube_video_id: "abc" },
      { call_id: 11, video_id: 101, symbol: "ETHUSDT", direction: "bullish", call_date: "2026-03-12", raw_quote: "ETH also looks strong", score: 8, alpha_30d: -4, return_30d: -8, correct_direction: false, extraction_confidence: 0.88, source_table: "calls", video_title: "ETH plan", youtube_video_id: "def" },
    ] as T[];
    if (sql.includes("FROM videos")) return [{ video_id: 100, youtube_video_id: "abc", title: "BTC plan", published_at: "2026-03-10", transcript_available: true, source_table: "videos" }] as T[];
    throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
  };
}

test("loads evidence from calls/videos/transcripts and identifies contradictions", async () => {
  const pack = await buildStormEvidencePack({ transition: transition(), queryFn: fakeQuery() });
  assert.equal(pack.creator_id, 1);
  assert.equal(pack.supporting_calls.length, 1);
  assert.equal(pack.contradicting_calls.length, 1);
  assert.equal(pack.recent_videos.length, 1);
  assert.equal(pack.quote_evidence[0].quote, "I am buying BTC here");
  const contradictions = buildStormContradictions(pack);
  assert.ok(contradictions.some((item) => item.source_table_or_artifact === "calls"));
});

test("treats news/media creators as context-only and refuses scoring-subject evidence pack", async () => {
  await assert.rejects(() => buildStormEvidencePack({ transition: transition(), queryFn: fakeQuery(true) }), /context-only/);
});

test("selects an interesting transition from a states artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "storm-transition-"));
  const path = join(dir, "states.json");
  writeFileSync(path, JSON.stringify([transition({ state: "INSUFFICIENT_DATA", confidence: 0.9 }), transition({ creator_id: 2, creator_name: "Interesting", state: "HIGH_VOLATILITY", confidence: 0.7 })]));
  const states = loadTransitionStatesArtifact(path);
  const selected = selectStormTransition(states);
  assert.equal(selected.state, "HIGH_VOLATILITY");
  rmSync(dir, { recursive: true, force: true });
});
