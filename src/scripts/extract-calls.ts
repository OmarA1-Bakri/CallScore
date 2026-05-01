import { query } from "../lib/db";
import {
  createGeminiModel,
  extractCallsFromTranscript,
} from "../lib/ai-extraction";
import type { Video } from "../lib/types";
import {
  loadEnv,
  replaceStoredCallsForVideo,
  sleep,
  timestamp,
} from "./script-helpers";

const REQUEST_GAP_MS = 4_000;
const BATCH_COOLDOWN_VIDEOS = 50;
const BATCH_COOLDOWN_MS = 30_000;

async function replaceVideoCalls(
  model: ReturnType<typeof createGeminiModel>,
  video: Video & { readonly creator_id: number },
  dryRun = false,
): Promise<number> {
  if (!video.transcript || video.transcript.trim().length === 0) {
    return 0;
  }

  const calls = await extractCallsFromTranscript(model, video.transcript);
  if (dryRun) return calls.length;

  await replaceStoredCallsForVideo({
    creatorId: video.creator_id,
    videoId: video.id,
    callDate: video.published_at ?? video.created_at,
    calls,
    markVideoExtracted: true,
  });

  return calls.length;
}

async function main(): Promise<void> {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[${timestamp()}] Starting call extraction (Gemini, normalized)...`);
  const model = createGeminiModel();

  const videos = await query<Video & { creator_id: number }>(
    `SELECT v.*, v.creator_id
     FROM videos v
     WHERE v.calls_extracted = false
       AND v.transcript IS NOT NULL
       AND v.transcript_quality > 0.2
     ORDER BY v.published_at DESC
     LIMIT 500`,
  );

  console.log(`[${timestamp()}] Found ${videos.length} videos to process`);

  let totalCalls = 0;
  let processed = 0;

  for (const video of videos) {
    try {
      const callCount = await replaceVideoCalls(model, video, dryRun);
      totalCalls += callCount;
      processed++;
      console.log(
        `[${timestamp()}] [${processed}/${videos.length}] ${video.title}: ${callCount} calls extracted`,
      );
      await sleep(REQUEST_GAP_MS);
      if (processed % BATCH_COOLDOWN_VIDEOS === 0) {
        console.log(`[${timestamp()}] cooldown ${BATCH_COOLDOWN_MS / 1000}s`);
        await sleep(BATCH_COOLDOWN_MS);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Error processing video ${video.id}: ${message}`);
    }
  }

  console.log(
    `[${timestamp()}] Extraction complete: ${processed} videos processed, ${totalCalls} calls extracted`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
