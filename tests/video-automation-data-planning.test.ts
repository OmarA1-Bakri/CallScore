import assert from "node:assert/strict";
import test from "node:test";
import { loadCallScoreVideoCandidates } from "../src/video/data/load-callscore-video-candidates";
import { mockVideoCandidates } from "../src/video/data/mock-video-candidates";
import { rankVideoCandidates } from "../src/video/data/rank-video-candidates";
import { planVideo } from "../src/video/planning/video-planner.graph";
import { validateScriptClaims } from "../src/video/planning/validate-claims";
import { validateScriptText } from "../src/video/planning/validate-script";

test("candidate ranking is deterministic and favors stronger content scores", () => {
  const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
  assert.equal(ranked[0]?.creator.name, "Example Alpha Caller");
  assert.ok((ranked[0]?.contentScore ?? 0) > 0);
});

test("candidate loader maps provider-portable rows into canonical creator schema", async () => {
  const rows = await loadCallScoreVideoCandidates({
    limit: 1,
    queryFn: async (sql) => {
      if (sql.includes("FROM creators")) return [{ creator_id: "1", name: "Loader Creator", youtube_handle: "@loader", youtube_channel_id: null, total_calls: "5", win_rate: "0.6", alpha_score: "44", accuracy_rank: "2", recent_resolved_calls: "3", score_delta: "0", rank_movement: "0" }] as never;
      return [{ id: "9", creator_id: "1", video_id: "20", symbol: "ETH", direction: "bullish", raw_quote: "ETH looks strong", call_date: "2026-06-22T00:00:00.000Z", score: "77", return_30d: "0.1", alpha_30d: "0.02", extraction_confidence: "0.9", correct_direction: true }] as never;
    },
  });
  assert.equal(rows[0]?.name, "Loader Creator");
  assert.equal(rows[0]?.recentCalls[0]?.outcome, "won");
});

test("planner creates validated product-led script, scenes, and metadata", () => {
  const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
  const output = planVideo({ rankedCandidates: ranked, runDate: "2026-06-23T00:00:00.000Z" });
  assert.equal(output.format, "daily_short");
  assert.ok(output.scriptPackage.voiceover.includes("CallScore"));
  assert.ok(output.scenes.length >= 5);
  assert.ok(output.metadata.title.length <= 100);
  assert.equal(validateScriptText(output.scriptPackage.voiceover, { minWords: 40, maxWords: 150 }).ok, true);
  assert.equal(validateScriptClaims(output.scriptPackage, [output.selectedCreator]).ok, true);
});

test("script validator blocks unsafe terms", () => {
  const result = validateScriptText("This is financial advice and guaranteed.");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("financial advice")));
});
