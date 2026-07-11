import assert from "node:assert/strict";
import test from "node:test";
import { rankVideoCandidates } from "../src/video/data/rank-video-candidates";
import { planVideo } from "../src/video/planning/video-planner.graph";
import type { CreatorScore } from "../src/video/schemas/video.schemas";

const creatorWithOnlyOpenCalls: CreatorScore = {
  creatorId: 4,
  name: "Discover Crypto",
  youtubeHandle: "@DiscoverCrypto_",
  youtubeChannelId: "UCjemQfjaXAzA-95RKoy9n_g",
  totalCalls: 880,
  winRate: 0.419,
  alphaScore: 28.7,
  rank: 11,
  scoreDelta: 0,
  rankMovement: 0,
  recentResolvedCalls: 0,
  recentCalls: [
    {
      id: 25861,
      creatorId: 4,
      videoId: 51219,
      symbol: "AVAXUSDT",
      direction: "bearish",
      outcome: "open",
      rawQuote: "An unresolved AVAX call.",
      callDate: "2026-07-10T01:29:17.000Z",
      score: 0,
      return30d: null,
      alpha30d: null,
      extractionConfidence: 0.6,
    },
  ],
};

test("video planner never presents an open call as resolved evidence", () => {
  const ranked = rankVideoCandidates([creatorWithOnlyOpenCalls], new Date("2026-07-11T04:00:00.000Z"));
  const plan = planVideo({ format: "daily_short", rankedCandidates: ranked, runDate: "2026-07-11T04:00:00.000Z" });

  assert.doesNotMatch(plan.scriptPackage.voiceover, /resolved as open/i);
  assert.doesNotMatch(plan.scriptPackage.voiceover, /CallScore alpha score/i);
  assert.match(plan.scriptPackage.voiceover, /current CallScore creator score is 29/i);
  assert.match(plan.scriptPackage.voiceover, /watch new resolved calls/i);
  assert.deepEqual(plan.scriptPackage.evidenceRefs, ["creator:4"]);

  const timeline = plan.scenes.find((scene) => scene.sceneId === "timeline");
  assert.ok(timeline);
  assert.doesNotMatch(timeline.narration, /resolved as open/i);
  assert.deepEqual(timeline.dataRefs, []);
});

test("YouTube metadata carries an attributed creator destination", () => {
  const ranked = rankVideoCandidates([creatorWithOnlyOpenCalls], new Date("2026-07-11T04:00:00.000Z"));
  const plan = planVideo({ format: "daily_short", rankedCandidates: ranked, runDate: "2026-07-11T04:00:00.000Z" });

  assert.match(plan.metadata.description, /https:\/\/call-score\.com\/creator\/discovercrypto_/);
  assert.match(plan.metadata.description, /utm_source=youtube/);
  assert.match(plan.metadata.description, /utm_medium=organic_video/);
  assert.match(plan.metadata.description, /utm_campaign=creator_accountability/);
  assert.match(plan.metadata.description, /utm_content=daily_short_4/);
});
