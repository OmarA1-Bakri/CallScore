import fs from "node:fs/promises";
import { buildVideoArtifactPaths } from "../artifacts/artifact-paths";
import { loadVideoAutomationConfig } from "../config/publishing-config";
import { createAndEnqueueVideoJob } from "./video-queues";
import type { VideoFormat } from "../schemas/video.schemas";

export interface ScheduledVideoJobResult {
  readonly format: VideoFormat;
  readonly jobId: string;
  readonly queuePath: string | null;
  readonly skipped: boolean;
}

export interface ScheduledVideoJobOptions {
  readonly artifactRoot?: string;
  readonly queueRoot?: string;
}

function scheduledJobId(format: VideoFormat, now: Date): string {
  return `${format}-${now.toISOString().slice(0, 10)}`;
}

async function stateExists(jobId: string, artifactRoot?: string): Promise<boolean> {
  try {
    await fs.stat(buildVideoArtifactPaths(jobId, artifactRoot).stateJson);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function enqueueOne(format: VideoFormat, now: Date, options: ScheduledVideoJobOptions): Promise<ScheduledVideoJobResult> {
  const jobId = scheduledJobId(format, now);
  if (await stateExists(jobId, options.artifactRoot)) {
    return { format, jobId, queuePath: null, skipped: true };
  }
  const created = await createAndEnqueueVideoJob({
    format,
    jobId,
    artifactRoot: options.artifactRoot,
    queueRoot: options.queueRoot,
    now,
  });
  return { format, jobId: created.state.jobId, queuePath: created.queuePath, skipped: false };
}

export async function enqueueScheduledVideoJobs(now = new Date(), options: ScheduledVideoJobOptions = {}): Promise<readonly ScheduledVideoJobResult[]> {
  const config = loadVideoAutomationConfig();
  if (!config.enabled) return [];
  const artifactRoot = options.artifactRoot ?? config.artifactsDir;
  const schedulerOptions = { artifactRoot, queueRoot: options.queueRoot };
  const results: ScheduledVideoJobResult[] = [];
  results.push(await enqueueOne("daily_short", now, schedulerOptions));
  const day = now.getUTCDay();
  if (day === 1) {
    results.push(await enqueueOne("weekly_investigation", now, schedulerOptions));
  }
  if (day === 3) {
    results.push(await enqueueOne("leaderboard_update", now, schedulerOptions));
  }
  return results;
}
