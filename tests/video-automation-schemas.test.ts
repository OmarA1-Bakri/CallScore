import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoArtifactPaths, sanitizeJobId } from "../src/video/artifacts/artifact-paths";
import { CreatorScoreSchema, VideoJobStateSchema, isoNow } from "../src/video/schemas/video.schemas";
import { ComposioPublishResultSchema } from "../src/video/schemas/youtube.schemas";
import { mockVideoCandidates } from "../src/video/data/mock-video-candidates";

test("video Zod schemas validate canonical creator and job state", () => {
  const creator = CreatorScoreSchema.parse(mockVideoCandidates[0]);
  const now = isoNow();
  const state = VideoJobStateSchema.parse({
    jobId: "video-test-001",
    runDate: now,
    format: "daily_short",
    status: "queued",
    selectedCreator: creator,
    creators: [creator],
    scriptPackage: null,
    audioPath: null,
    normalizedAudioPath: null,
    captionsPath: null,
    srtPath: null,
    videoPath: null,
    thumbnailPath: null,
    metadata: null,
    qaReport: null,
    youtubeVideoId: null,
    publishUrl: null,
    artifactDir: "artifacts/video-jobs/video-test-001",
    errors: [],
    warnings: [],
    createdAt: now,
    updatedAt: now,
  });
  assert.equal(state.creators.length, 1);
});

test("youtube publish result schema keeps raw response JSON-compatible", () => {
  const parsed = ComposioPublishResultSchema.parse({
    jobId: "job-1",
    youtubeVideoId: "abc123",
    publishUrl: "https://youtu.be/abc123",
    privacyStatus: "public",
    publishAt: null,
    rawResponse: { ok: true, nested: [1, "two", null] },
  });
  assert.equal(parsed.youtubeVideoId, "abc123");
});

test("artifact paths sanitize job ids and stay deterministic", () => {
  assert.equal(sanitizeJobId("bad/id?x"), "bad-id-x");
  const paths = buildVideoArtifactPaths("daily-2026-06-23", "artifacts/video-jobs");
  assert.equal(paths.videoMp4, "artifacts/video-jobs/daily-2026-06-23/video.mp4");
});
