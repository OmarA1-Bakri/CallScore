/**
 * Video queue consumer — polls .tmp/video-queue/ for pending job stages
 * and advances them through the pipeline.
 *
 * Usage:
 *   node --import tsx src/scripts/video-queue-consumer.ts [--max-jobs N]
 *
 * Intended to run as a no_agent cron job every 5 minutes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runVideoStage } from "../video/queues/start-video-workers";
import {
  VIDEO_STAGES,
  enqueueVideoStage,
  type VideoStage,
} from "../video/queues/video-queues";

const QUEUE_ROOT = path.join(process.cwd(), ".tmp/video-queue");
const LOG_TAG = "[video-consumer]";

function log(...args: unknown[]) {
  console.log(LOG_TAG, new Date().toISOString(), ...args);
}

function stageIndex(stage: VideoStage): number {
  const idx = VIDEO_STAGES.indexOf(stage);
  if (idx === -1) throw new Error(`Unknown stage: ${stage}`);
  return idx;
}

function nextStage(current: VideoStage): VideoStage | null {
  const idx = stageIndex(current);
  if (idx + 1 >= VIDEO_STAGES.length) return null;
  return VIDEO_STAGES[idx + 1];
}

async function listQueueFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(QUEUE_ROOT);
    return entries
      .filter((e) => e.endsWith(".json"))
      .sort() // oldest first by name (timestamp prefix)
      .map((e) => path.join(QUEUE_ROOT, e));
  } catch {
    return [];
  }
}

interface QueueEntry {
  readonly filePath: string;
  readonly jobId: string;
  readonly stage: VideoStage;
  readonly statePath: string;
}

async function parseQueueItem(filePath: string): Promise<QueueEntry | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as {
      jobId?: unknown;
      stage?: unknown;
      statePath?: unknown;
    };
    if (
      typeof parsed.jobId !== "string" ||
      typeof parsed.stage !== "string" ||
      typeof parsed.statePath !== "string"
    ) {
      log("malformed queue item, removing:", filePath);
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    if (!VIDEO_STAGES.includes(parsed.stage as VideoStage)) {
      log("unknown stage in queue item, removing:", filePath, parsed.stage);
      await fs.unlink(filePath).catch(() => {});
      return null;
    }
    return {
      filePath,
      jobId: parsed.jobId,
      stage: parsed.stage as VideoStage,
      statePath: parsed.statePath,
    };
  } catch (error) {
    log("failed to parse queue item, removing:", filePath, String(error));
    await fs.unlink(filePath).catch(() => {});
    return null;
  }
}

export async function consumeQueue(maxJobs = 5): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const files = await listQueueFiles();
  if (files.length === 0) {
    log("queue empty");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  log("found", files.length, "pending items, processing up to", maxJobs);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const filePath of files) {
    if (processed >= maxJobs) break;

    const entry = await parseQueueItem(filePath);
    if (!entry) continue;

    processed++;
    log("processing:", entry.jobId, "stage:", entry.stage);

    try {
      await runVideoStage(entry.stage, entry.statePath);
    } catch (error) {
      log("stage failed:", entry.jobId, entry.stage, String(error));
      failed++;
      // Remove the queue item so we don't retry infinitely
      await fs.unlink(entry.filePath).catch(() => {});
      continue;
    }

    // Stage succeeded — enqueue next stage or finish
    const next = nextStage(entry.stage);
    if (next) {
      await enqueueVideoStage(
        {
          jobId: entry.jobId,
          stage: next,
          statePath: entry.statePath,
          enqueuedAt: new Date().toISOString(),
        },
        QUEUE_ROOT,
      );
      log("enqueued next stage:", entry.jobId, next);
    } else {
      log("pipeline complete:", entry.jobId);
    }

    // Remove processed queue item
    await fs.unlink(entry.filePath).catch(() => {});
    succeeded++;
  }

  log("done — processed:", processed, "succeeded:", succeeded, "failed:", failed);
  return { processed, succeeded, failed };
}

// ── CLI entrypoint ──

async function main() {
  const args = process.argv.slice(2);
  const maxJobs = Math.min(
    Math.max(
      1,
      Number(args.find((a) => a.startsWith("--max-jobs="))?.split("=")[1] ?? 5),
    ),
    20,
  );

  const result = await consumeQueue(maxJobs);
  if (result.failed > 0) {
    console.error(
      LOG_TAG,
      `${result.failed} stage(s) failed — check logs for details`,
    );
    process.exit(1);
  }
}

const isMainModule =
  typeof process !== "undefined" &&
  process.argv.length >= 2 &&
  process.argv[1]?.includes("video-queue-consumer");

if (isMainModule) {
  main().catch((error) => {
    console.error(LOG_TAG, "fatal:", String(error));
    process.exit(1);
  });
}
