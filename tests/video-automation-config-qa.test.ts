import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { computePublishAt, loadVideoAutomationConfig } from "../src/video/config/publishing-config";
import { decidePublish } from "../src/video/qa/publish-decision";
import { createVideoJobState, createAndEnqueueVideoJob } from "../src/video/queues/video-queues";
import { qaVideoJob } from "../src/video/qa/qa-job";
import { mockVideoCandidates } from "../src/video/data/mock-video-candidates";
import { planVideo } from "../src/video/planning/video-planner.graph";
import { rankVideoCandidates } from "../src/video/data/rank-video-candidates";

test("video publishing config parses env and computes next scheduled slot", () => {
  const config = loadVideoAutomationConfig({ VIDEO_AUTO_PUBLISH: "true", VIDEO_YOUTUBE_PRIVACY: "public", VIDEO_PUBLISH_MODE: "scheduled", VIDEO_SCHEDULE_TIME_LOCAL: "09:00" } as unknown as NodeJS.ProcessEnv);
  assert.equal(config.autoPublish, true);
  assert.equal(config.privacyStatus, "public");
  const publishAt = computePublishAt({ config, now: new Date("2026-06-23T10:00:00.000Z") });
  assert.equal(publishAt, "2026-06-24T02:00:00.000Z");
});

test("publish decision requires QA pass and auto publish enabled", () => {
  const config = loadVideoAutomationConfig({ VIDEO_AUTO_PUBLISH: "true", VIDEO_YOUTUBE_PRIVACY: "public" } as unknown as NodeJS.ProcessEnv);
  const qa = { ok: true, checkedAt: "2026-06-23T00:00:00.000Z", format: "daily_short" as const, videoExists: true, audioStreamPresent: true, dimensionsOk: true, durationOk: true, thumbnailExists: true, metadataValid: true, claimsValid: true, warnings: [], errors: [] };
  assert.equal(decidePublish(config, qa).shouldPublish, true);
  assert.equal(decidePublish(loadVideoAutomationConfig({ VIDEO_AUTO_PUBLISH: "false" } as unknown as NodeJS.ProcessEnv), qa).reason, "auto_publish_disabled");
});

test("QA job fails safely when media artifacts are missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-video-qa-"));
  const state = createVideoJobState({ jobId: "qa-test", format: "daily_short", artifactRoot: dir, now: new Date("2026-06-23T00:00:00.000Z") });
  const ranked = rankVideoCandidates(mockVideoCandidates, new Date("2026-06-23T00:00:00.000Z"));
  const plan = planVideo({ rankedCandidates: ranked, runDate: state.runDate });
  const report = await qaVideoJob({ ...state, selectedCreator: plan.selectedCreator, creators: [plan.selectedCreator], scriptPackage: plan.scriptPackage, metadata: plan.metadata, videoPath: path.join(dir, "missing.mp4"), thumbnailPath: path.join(dir, "missing.jpg") });
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("video_missing"));
});

test("file-backed queue creates canonical state and queue item", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "callscore-video-queue-"));
  const queue = path.join(dir, "queue");
  const result = await createAndEnqueueVideoJob({ format: "daily_short", artifactRoot: path.join(dir, "artifacts"), queueRoot: queue, now: new Date("2026-06-23T00:00:00.000Z") });
  assert.equal(result.state.status, "queued");
  assert.ok((await fs.stat(result.queuePath)).size > 0);
});
