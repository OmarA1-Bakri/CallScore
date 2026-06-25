import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";
import { buildVideoArtifactPaths } from "../../../video/artifacts/artifact-paths";
import { createVideoJobState, type VideoStage } from "../../../video/queues/video-queues";

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
    const approved = state.config.approved === true;

    const statePath = configuredStatePath ?? ensureFixtureStatePath({ artifactRoot, jobId: configuredJobId });
    const stage = stageForStatus(readVideoStatus(statePath));
    const artifactPath = join(dirname(statePath), `operating-video-node-${Date.now()}.json`);

    if (stage === "publish" && !approved) {
      const detail = { stage, stages: [stage], executed_stages: 0, state_path: statePath, approved: false, broll_dispatcher_wired: true };
      writeFileSync(artifactPath, `${JSON.stringify({ schema_version: "callscore_video_goal_loop_receipt.v1", status: "blocked", detail }, null, 2)}\n`, { mode: 0o600 });
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
    writeFileSync(artifactPath, `${JSON.stringify({ schema_version: "callscore_video_goal_loop_receipt.v1", status: "ok", detail }, null, 2)}\n`, { mode: 0o600 });
    return {
      status: "ok" as const,
      summary: `Dispatched video stage: ${stage}`,
      artifact_path: artifactPath,
      detail,
      mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    };
  },
});
