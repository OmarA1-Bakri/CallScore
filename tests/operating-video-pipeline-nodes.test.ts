import * as assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  buildInitialOperatingState,
  createCallscoreOperatingGraph,
} from "../src/lib/workplane/callscore-operating-graph";
import { buildVideoArtifactPaths } from "../src/video/artifacts/artifact-paths";
import { createVideoJobState, type VideoStage } from "../src/video/queues/video-queues";
import { VideoJobStateSchema } from "../src/video/schemas/video.schemas";

async function writeState(root: string, overrides: Partial<ReturnType<typeof createVideoJobState>> = {}) {
  const base = createVideoJobState({ jobId: overrides.jobId ?? "video-operating-test", format: "daily_short", artifactRoot: root, now: new Date("2026-06-25T00:00:00.000Z") });
  const state = VideoJobStateSchema.parse({ ...base, ...overrides });
  const paths = buildVideoArtifactPaths(state.jobId, root);
  mkdirSync(paths.artifactDir, { recursive: true });
  await writeFile(paths.stateJson, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { state, paths };
}

function liveGateContext() {
  return {
    workplaneStatus: { status: "OK", automation_readiness: "CONTROLLED_FULL", autonomous_revenue_status: "YES" },
    heartbeat: {
      heartbeat_id: "video-test-heartbeat",
      fresh: true,
      lease_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
  };
}

async function writeQueueItem(root: string, input: { jobId: string; stage: VideoStage; statePath: string }) {
  const filePath = join(root, `1000-${input.jobId}-${input.stage}.json`);
  await writeFile(filePath, `${JSON.stringify({ ...input, enqueuedAt: "2026-06-25T00:00:00.000Z" }, null, 2)}\n`, "utf8");
  return filePath;
}

describe("operating video pipeline nodes", () => {
  test("produce_video creates a fixture job and advances exactly one dry-run stage", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "operating-video-create-"));
    const calls: VideoStage[] = [];
    const graph = createCallscoreOperatingGraph();

    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "produce_video", dryRun: true, testFixtures: true }),
      {
        configurable: {
          thread_id: "operating-video-create-test",
          videoArtifactRoot: artifactRoot,
          videoStageRunner: async (stage: VideoStage, statePath: string) => {
            calls.push(stage);
            return statePath;
          },
        },
      },
    );

    const videoNode = result.node_results.find((item) => item.node_id === "video_goal_loop");
    assert.equal(videoNode?.status, "ok");
    assert.deepEqual(calls, ["plan"]);
    assert.equal(videoNode?.detail.executed_stages, 1);
    assert.deepEqual(videoNode?.detail.stages, ["plan"]);
    assert.equal(typeof videoNode?.detail.state_path, "string");
    assert.equal(result.mutation_flags.public_publish_performed, false);
    assert.equal(result.mutation_flags.provider_mutation_performed, false);
  });

  test("produce_video dispatches broll after captions before render", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "operating-video-broll-"));
    const { paths } = await writeState(artifactRoot, { jobId: "video-broll-dispatch", status: "captions_generated" });
    const calls: VideoStage[] = [];
    const graph = createCallscoreOperatingGraph();

    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "produce_video", videoJobId: "video-broll-dispatch", dryRun: true, testFixtures: true }),
      {
        configurable: {
          thread_id: "operating-video-broll-test",
          videoStatePath: paths.stateJson,
          videoStageRunner: async (stage: VideoStage, statePath: string) => {
            calls.push(stage);
            return statePath;
          },
        },
      },
    );

    const videoNode = result.node_results.find((item) => item.node_id === "video_goal_loop");
    assert.equal(videoNode?.status, "ok");
    assert.deepEqual(calls, ["broll"]);
    assert.deepEqual(videoNode?.detail.stages, ["broll"]);
    assert.equal(result.blockers.includes("publish_approval_missing"), false);
  });

  test("produce_video blocks at publish without approval instead of faking success", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "operating-video-publish-block-"));
    const { paths } = await writeState(artifactRoot, { jobId: "video-publish-block", status: "qa_passed" });
    const calls: VideoStage[] = [];
    const graph = createCallscoreOperatingGraph();

    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "produce_video", videoJobId: "video-publish-block", dryRun: true, approved: false, testFixtures: true }),
      {
        configurable: {
          thread_id: "operating-video-publish-block-test",
          videoStatePath: paths.stateJson,
          videoStageRunner: async (stage: VideoStage, statePath: string) => {
            calls.push(stage);
            return statePath;
          },
        },
      },
    );

    const videoNode = result.node_results.find((item) => item.node_id === "video_goal_loop");
    assert.equal(videoNode?.status, "blocked");
    assert.deepEqual(calls, []);
    assert.equal(videoNode?.blockers.includes("publish_approval_missing"), true);
    assert.equal(result.blockers.includes("publish_approval_missing"), true);
    assert.equal(result.mutation_flags.public_publish_performed, false);
    assert.equal(result.mutation_flags.provider_mutation_performed, false);
  });

  test("produce_video read-live consumes exactly one existing queue item through the operating graph", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "operating-video-live-artifacts-"));
    const queueRoot = mkdtempSync(join(tmpdir(), "operating-video-live-queue-"));
    const { paths } = await writeState(artifactRoot, { jobId: "video-live-queue-test", status: "queued" });
    const originalQueuePath = await writeQueueItem(queueRoot, { jobId: "video-live-queue-test", stage: "plan", statePath: paths.stateJson });
    const calls: VideoStage[] = [];
    const graph = createCallscoreOperatingGraph();

    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "produce_video", mode: "read_live", dryRun: false, maxItems: 1 }),
      {
        configurable: {
          thread_id: "operating-video-live-queue-test",
          ...liveGateContext(),
          videoQueueRoot: queueRoot,
          videoStageRunner: async (stage: VideoStage, statePath: string) => {
            calls.push(stage);
            return statePath;
          },
        },
      },
    );

    const videoNode = result.node_results.find((item) => item.node_id === "video_goal_loop");
    assert.equal(videoNode?.status, "ok");
    assert.deepEqual(calls, ["plan"]);
    assert.equal(videoNode?.detail.queue_path, originalQueuePath);
    assert.equal(videoNode?.detail.next_stage, "audio");
    assert.equal(videoNode?.detail.executed_stages, 1);
    assert.equal(existsSync(originalQueuePath), false);
    const remainingQueueFiles = readdirSync(queueRoot).filter((name) => name.endsWith(".json"));
    assert.equal(remainingQueueFiles.length, 1);
    assert.match(remainingQueueFiles[0], /video-live-queue-test-audio\.json$/);
    assert.equal(result.mutation_flags.public_publish_performed, false);
    assert.equal(result.mutation_flags.provider_mutation_performed, false);
  });

  test("start-video worker dispatcher contains broll between captions and render", () => {
    const source = readFileSync("src/video/queues/start-video-workers.ts", "utf8");
    assert.match(source, /stage === "broll"\) return runBrollStage\(statePath\)/);
    assert.match(source, /\["plan", "audio", "captions", "broll", "render", "thumbnail", "qa"\]/);
  });
});
