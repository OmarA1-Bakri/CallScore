import fs from "node:fs/promises";
import path from "node:path";
import { buildVideoArtifactPaths } from "../artifacts/artifact-paths";
import { writeJsonArtifact } from "../artifacts/state-store";
import { isoNow, VideoFormatSchema, VideoJobStateSchema, type VideoFormat, type VideoJobState } from "../schemas/video.schemas";

export const VIDEO_STAGES = ["plan", "audio", "captions", "broll", "render", "thumbnail", "qa", "publish", "analytics"] as const;
export type VideoStage = (typeof VIDEO_STAGES)[number];

export interface VideoQueueItem {
  readonly jobId: string;
  readonly stage: VideoStage;
  readonly statePath: string;
  readonly enqueuedAt: string;
}

export function videoRunKey(format: VideoFormat, now = new Date()): string {
  return `video-${format}:${now.toISOString().slice(0, 10)}`;
}

export function createVideoJobState(input: { readonly jobId: string; readonly format: VideoFormat; readonly artifactRoot?: string; readonly now?: Date }): VideoJobState {
  const nowIso = (input.now ?? new Date()).toISOString();
  const paths = buildVideoArtifactPaths(input.jobId, input.artifactRoot);
  return VideoJobStateSchema.parse({
    jobId: input.jobId,
    runDate: nowIso,
    format: VideoFormatSchema.parse(input.format),
    status: "queued",
    selectedCreator: null,
    creators: [],
    scriptPackage: null,
    audioPath: null,
    normalizedAudioPath: null,
    captionsPath: null,
    srtPath: null,
    brollManifestPath: null,
    videoPath: null,
    thumbnailPath: null,
    metadata: null,
    qaReport: null,
    youtubeVideoId: null,
    publishUrl: null,
    artifactDir: paths.artifactDir,
    errors: [],
    warnings: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

export async function enqueueVideoStage(item: VideoQueueItem, queueRoot = ".tmp/video-queue"): Promise<string> {
  const filePath = path.join(queueRoot, `${Date.now()}-${item.jobId}-${item.stage}.json`);
  await writeJsonArtifact(filePath, item as never, { force: true });
  return filePath;
}

export async function createAndEnqueueVideoJob(input: { readonly format: VideoFormat; readonly jobId?: string; readonly artifactRoot?: string; readonly queueRoot?: string; readonly now?: Date }): Promise<{ readonly state: VideoJobState; readonly queuePath: string }> {
  const now = input.now ?? new Date();
  const jobId = input.jobId ?? `${input.format}-${now.toISOString().replace(/[:.]/g, "-")}`;
  const state = createVideoJobState({ jobId, format: input.format, artifactRoot: input.artifactRoot, now });
  const paths = buildVideoArtifactPaths(jobId, input.artifactRoot);
  await fs.mkdir(paths.artifactDir, { recursive: true });
  await writeJsonArtifact(paths.stateJson, state as never, { force: true });
  const queuePath = await enqueueVideoStage({ jobId, stage: "plan", statePath: paths.stateJson, enqueuedAt: isoNow() }, input.queueRoot);
  return { state, queuePath };
}
