import fs from "node:fs/promises";
import path from "node:path";
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

async function hasExistingStateForFormatDay(input: { readonly format: VideoFormat; readonly day: string; readonly artifactRoot?: string; readonly deterministicJobId: string }): Promise<boolean> {
  if (await stateExists(input.deterministicJobId, input.artifactRoot)) return true;
  const root = input.artifactRoot ?? loadVideoAutomationConfig().artifactsDir;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(root, entry.name, "state.json"), "utf8")) as { format?: unknown; runDate?: unknown };
      if (parsed.format === input.format && typeof parsed.runDate === "string" && parsed.runDate.slice(0, 10) === input.day) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return false;
}

async function enqueueOne(format: VideoFormat, now: Date, options: ScheduledVideoJobOptions): Promise<ScheduledVideoJobResult> {
  const day = now.toISOString().slice(0, 10);
  const jobId = scheduledJobId(format, now);
  if (await hasExistingStateForFormatDay({ format, day, deterministicJobId: jobId, artifactRoot: options.artifactRoot })) {
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
