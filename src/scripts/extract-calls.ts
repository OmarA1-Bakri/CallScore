import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import {
  createGeminiModel,
  extractCallsFromTranscript,
} from "../lib/ai-extraction";
import type { Video } from "../lib/types";

const REQUEST_GAP_MS = 4_000;
const BATCH_COOLDOWN_VIDEOS = 50;
const BATCH_COOLDOWN_MS = 30_000;

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  await query("DELETE FROM calls WHERE video_id = $1", [video.id]);

  for (const call of calls) {
    const callDate = video.published_at ?? video.created_at;
    await query(
      `INSERT INTO calls (
        creator_id, video_id, symbol, direction, call_type,
        entry_price, target_price, stop_loss, timeframe,
        confidence, strategy_type, raw_quote,
        extraction_confidence, specificity_score, call_date
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13, $14, $15
      )`,
      [
        video.creator_id,
        video.id,
        call.symbol,
        call.direction,
        call.call_type,
        call.entry_price,
        call.target_price,
        call.stop_loss,
        call.timeframe,
        call.confidence,
        call.strategy_type,
        call.raw_quote,
        call.extraction_confidence,
        call.specificity_score,
        callDate,
      ],
    );
  }

  await query(
    "UPDATE videos SET calls_extracted = true, extraction_pass = extraction_pass + 1 WHERE id = $1",
    [video.id],
  );

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
