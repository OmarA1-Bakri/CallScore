import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";
import { buildVideoArtifactPaths } from "../../../video/artifacts/artifact-paths";
import { runVideoStage } from "../../../video/queues/start-video-workers";
import { createVideoJobState, enqueueVideoStage, VIDEO_STAGES, type VideoStage } from "../../../video/queues/video-queues";
import { enqueueScheduledVideoJobs } from "../../../video/queues/scheduler";

const VIDEO_OPERATING_ARTIFACT_DIR = ".tmp/workflow-receipts/callscore_operating_graph/video";

function stageForStatus(status: string | null | undefined): VideoStage {
  switch (status) {
    case "queued":
    case "data_loaded":
      return "plan";
    case "planned":
    case "scripted":
      return "audio";
    case "audio_generated":
      return "captions";
    case "captions_generated":
      return "broll";
    case "broll_ready":
      return "render";
    case "rendered":
      return "thumbnail";
    case "thumbnail_generated":
      return "qa";
    case "qa_passed":
      return "publish";
    default:
      return "plan";
  }
}

function readVideoStatus(statePath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as { status?: unknown };
    return typeof parsed.status === "string" ? parsed.status : null;
  } catch {
    return null;
  }
}

interface VideoQueueEntry {
  readonly filePath: string;
  readonly jobId: string;
  readonly stage: VideoStage;
  readonly statePath: string;
}

function nextStage(current: VideoStage): VideoStage | null {
  const index = VIDEO_STAGES.indexOf(current);
  return index >= 0 && index + 1 < VIDEO_STAGES.length ? VIDEO_STAGES[index + 1] : null;
}

function listQueueFiles(queueRoot: string): string[] {
  if (!existsSync(queueRoot)) return [];
  return readdirSync(queueRoot)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(queueRoot, name));
}

function readQueueEntry(filePath: string): VideoQueueEntry | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { jobId?: unknown; stage?: unknown; statePath?: unknown };
    if (typeof parsed.jobId !== "string" || typeof parsed.stage !== "string" || typeof parsed.statePath !== "string") return null;
    if (!VIDEO_STAGES.includes(parsed.stage as VideoStage)) return null;
    return { filePath, jobId: parsed.jobId, stage: parsed.stage as VideoStage, statePath: parsed.statePath };
  } catch {
    return null;
  }
}

function writeVideoNodeArtifact(statePath: string, payload: Record<string, unknown>): string {
  mkdirSync(dirname(statePath), { recursive: true });
  const artifactPath = join(dirname(statePath), `operating-video-node-${Date.now()}.json`);
  writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return artifactPath;
}

function writeStandaloneVideoNodeArtifact(payload: Record<string, unknown>): string {
  mkdirSync(VIDEO_OPERATING_ARTIFACT_DIR, { recursive: true });
  const artifactPath = join(VIDEO_OPERATING_ARTIFACT_DIR, `operating-video-node-${Date.now()}.json`);
  writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return artifactPath;
}

function ensureFixtureStatePath(input: { artifactRoot?: string; jobId?: string }): string {
  const jobId = input.jobId ?? `video-operating-${Date.now()}`;
  const root = input.artifactRoot;
  const paths = buildVideoArtifactPaths(jobId, root);
  const state = createVideoJobState({ jobId, format: "daily_short", artifactRoot: root, now: new Date("2026-06-25T00:00:00.000Z") });
  mkdirSync(paths.artifactDir, { recursive: true });
  writeFileSync(paths.stateJson, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return paths.stateJson;
}

export const videoGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "video_goal_loop",
  domain: "video",
  run: async ({ state, config }) => {
    const cfg = config?.configurable as Record<string, unknown> | undefined;
    const runner = cfg?.videoStageRunner as ((stage: VideoStage, statePath: string) => Promise<string>) | undefined;
    const artifactRoot = cfg?.videoArtifactRoot as string | undefined;
    const configuredStatePath = cfg?.videoStatePath as string | undefined;
    const configuredJobId = state.config.videoJobId ?? undefined;
    const queueRoot = (cfg?.videoQueueRoot as string | undefined) ?? ".tmp/video-queue";
    const schedulerMode = cfg?.videoSchedulerMode as string | undefined;
    const schedulerNowRaw = cfg?.videoSchedulerNow as string | undefined;
    const approved = state.config.approved === true;

    if ((state.config.mode === "read_live" || state.config.mode === "live_owned_public") && schedulerMode === "enqueue_scheduled") {
      const scheduled = await enqueueScheduledVideoJobs(schedulerNowRaw ? new Date(schedulerNowRaw) : new Date(), { artifactRoot, queueRoot });
      const jobs = scheduled.map((item) => ({ format: item.format, job_id: item.jobId, queue_path: item.queuePath, skipped: item.skipped }));
      const enqueuedCount = scheduled.filter((item) => !item.skipped).length;
      const skippedCount = scheduled.filter((item) => item.skipped).length;
      const detail = {
        scheduler_mode: "enqueue_scheduled",
        jobs,
        enqueued_count: enqueuedCount,
        skipped_count: skippedCount,
        queue_root: queueRoot,
        artifact_root: artifactRoot ?? "artifacts/video-jobs",
        scheduler_now: schedulerNowRaw ?? null,
        approved,
        broll_dispatcher_wired: true,
      };
      const artifactPath = writeStandaloneVideoNodeArtifact({ schema_version: "callscore_video_scheduler_receipt.v1", status: "ok", detail });
      return {
        status: "ok" as const,
        summary: `Scheduled video jobs enqueued=${enqueuedCount} skipped=${skippedCount}.`,
        artifact_path: artifactPath,
        detail,
        mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
      };
    }

    if (!state.config.dryRun && (state.config.mode === "read_live" || state.config.mode === "live_owned_public") && !configuredStatePath) {
      const entry = listQueueFiles(queueRoot).map(readQueueEntry).find((item): item is VideoQueueEntry => item !== null);
      if (!entry) {
        const detail = { stage: null, stages: [], executed_stages: 0, queue_root: queueRoot, queue_empty: true, approved, broll_dispatcher_wired: true };
        const artifactPath = writeStandaloneVideoNodeArtifact({ schema_version: "callscore_video_goal_loop_receipt.v1", status: "video_queue_empty", detail });
        return {
          status: "blocked" as const,
          summary: "Video queue empty — no jobs to process.",
          blockers: ["video_queue_empty"],
          artifact_path: artifactPath,
          detail,
          mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
        };
      }

      if (entry.stage === "publish" && !approved) {
        const detail = { stage: entry.stage, stages: [entry.stage], executed_stages: 0, state_path: entry.statePath, queue_path: entry.filePath, approved: false, broll_dispatcher_wired: true };
        const artifactPath = writeVideoNodeArtifact(entry.statePath, { schema_version: "callscore_video_goal_loop_receipt.v1", status: "blocked", detail });
        return {
          status: "blocked" as const,
          summary: "Publish approval missing.",
          blockers: ["publish_approval_missing"],
          artifact_path: artifactPath,
          detail,
          mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
        };
      }

      const resultPath = runner ? await runner(entry.stage, entry.statePath) : await runVideoStage(entry.stage, entry.statePath);
      const next = nextStage(entry.stage);
      if (next) {
        await enqueueVideoStage({ jobId: entry.jobId, stage: next, statePath: entry.statePath, enqueuedAt: new Date().toISOString() }, queueRoot);
      }
      unlinkSync(entry.filePath);
      const detail = {
        stages: [entry.stage],
        executed_stages: 1,
        state_path: resultPath,
        stage: entry.stage,
        next_stage: next,
        queue_path: entry.filePath,
        queue_root: queueRoot,
        approved,
        broll_dispatcher_wired: true,
      };
      const artifactPath = writeVideoNodeArtifact(entry.statePath, { schema_version: "callscore_video_goal_loop_receipt.v1", status: "ok", detail });
      return {
        status: "ok" as const,
        summary: `Dispatched video stage from queue: ${entry.stage}`,
        artifact_path: artifactPath,
        detail,
        mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
      };
    }

    const statePath = configuredStatePath ?? ensureFixtureStatePath({ artifactRoot, jobId: configuredJobId });
    const stage = stageForStatus(readVideoStatus(statePath));

    if (stage === "publish" && !approved) {
      const detail = { stage, stages: [stage], executed_stages: 0, state_path: statePath, approved: false, broll_dispatcher_wired: true };
      const artifactPath = writeVideoNodeArtifact(statePath, { schema_version: "callscore_video_goal_loop_receipt.v1", status: "blocked", detail });
      return {
        status: "blocked" as const,
        summary: "Publish approval missing.",
        blockers: ["publish_approval_missing"],
        artifact_path: artifactPath,
        detail,
        mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
      };
    }

    const resultPath = runner ? await runner(stage, statePath) : statePath;
    const detail = {
      stages: [stage],
      executed_stages: 1,
      state_path: resultPath,
      stage,
      approved,
      broll_dispatcher_wired: true,
    };
    const artifactPath = writeVideoNodeArtifact(statePath, { schema_version: "callscore_video_goal_loop_receipt.v1", status: "ok", detail });
    return {
      status: "ok" as const,
      summary: `Dispatched video stage: ${stage}`,
      artifact_path: artifactPath,
      detail,
      mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    };
  },
});
