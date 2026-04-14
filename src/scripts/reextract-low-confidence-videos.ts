import * as fs from "fs";
import * as path from "path";
import { createGeminiModel, extractCallsFromTranscript } from "../lib/ai-extraction";
import { query } from "../lib/db";
import { recomputeDerivedFields } from "./rescore-derived";
import { recomputeAllStats } from "../lib/recompute-stats";

const REQUEST_GAP_MS = 4_000;
const BATCH_COOLDOWN_VIDEOS = 50;
const BATCH_COOLDOWN_MS = 30_000;

interface LowConfidenceVideo {
  readonly id: number;
  readonly creator_id: number;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly title: string | null;
  readonly transcript: string | null;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly low_conf_call_count: number;
}

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
    if (!process.env[key]) process.env[key] = value;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp(): string {
  return new Date().toISOString();
}

function parseArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) return null;
  return process.argv[index + 1];
}

function parseArgs(): {
  readonly write: boolean;
  readonly limit: number;
  readonly creatorHandle: string | null;
  readonly videoId: number | null;
} {
  const write = process.argv.includes("--write");
  const limit = Number(parseArgValue("--limit") ?? "50");
  const creatorHandle = parseArgValue("--creator");
  const videoIdValue = parseArgValue("--video");
  const videoId = videoIdValue ? parseInt(videoIdValue, 10) : null;
  return {
    write,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    creatorHandle,
    videoId,
  };
}

async function loadVideos(args: ReturnType<typeof parseArgs>): Promise<LowConfidenceVideo[]> {
  if (args.videoId !== null) {
    return query<LowConfidenceVideo>(
      `SELECT
        v.id,
        v.creator_id,
        cr.name AS creator_name,
        cr.youtube_handle,
        v.title,
        v.transcript,
        v.published_at::text,
        v.created_at::text,
        COUNT(c.id)::int AS low_conf_call_count
       FROM videos v
       JOIN creators cr ON cr.id = v.creator_id
       LEFT JOIN calls c ON c.video_id = v.id AND c.extraction_confidence < 0.7
       WHERE v.id = $1
       GROUP BY v.id, cr.name, cr.youtube_handle
       LIMIT 1`,
      [args.videoId],
    );
  }

  const params: unknown[] = [];
  let where = "c.extraction_confidence < 0.7";
  if (args.creatorHandle) {
    params.push(args.creatorHandle);
    where += ` AND cr.youtube_handle = $${params.length}`;
  }
  params.push(args.limit);

  return query<LowConfidenceVideo>(
    `SELECT
      v.id,
      v.creator_id,
      cr.name AS creator_name,
      cr.youtube_handle,
      v.title,
      v.transcript,
      v.published_at::text,
      v.created_at::text,
      COUNT(c.id)::int AS low_conf_call_count
     FROM videos v
     JOIN creators cr ON cr.id = v.creator_id
     JOIN calls c ON c.video_id = v.id
     WHERE ${where}
     GROUP BY v.id, cr.name, cr.youtube_handle
     ORDER BY COUNT(c.id) DESC, v.id ASC
     LIMIT $${params.length}`,
    params,
  );
}

async function replaceVideoCallsWithModel(
  model: ReturnType<typeof createGeminiModel>,
  video: LowConfidenceVideo,
): Promise<number> {
  if (!video.transcript || video.transcript.trim().length === 0) {
    return 0;
  }

  const extractedCalls = await extractCallsFromTranscript(model, video.transcript);

  await query("DELETE FROM calls WHERE video_id = $1", [video.id]);
  for (const call of extractedCalls) {
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
        video.published_at ?? video.created_at,
      ],
    );
  }

  return extractedCalls.length;
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const videos = await loadVideos(args);

  console.log(
    `[${timestamp()}] Loaded ${videos.length} low-confidence videos for re-extraction`,
  );

  if (!args.write) {
    for (const video of videos) {
      console.log(
        `video=${video.id} creator=${video.creator_name} low_conf_calls=${video.low_conf_call_count} title=${video.title ?? "--"}`,
      );
    }
    return;
  }

  let processed = 0;
  const touchedVideoIds: number[] = [];
  const model = createGeminiModel();
  for (const video of videos) {
    const inserted = await replaceVideoCallsWithModel(model, video);
    touchedVideoIds.push(video.id);
    processed++;
    console.log(
      `[${timestamp()}] [${processed}/${videos.length}] ${video.creator_name} video ${video.id}: ${video.low_conf_call_count} legacy -> ${inserted} normalized calls`,
    );
    await sleep(REQUEST_GAP_MS);
    if (processed % BATCH_COOLDOWN_VIDEOS === 0) {
      console.log(`[${timestamp()}] cooldown ${BATCH_COOLDOWN_MS / 1000}s`);
      await sleep(BATCH_COOLDOWN_MS);
    }
  }

  const touchedCallRows = await query<{ id: number }>(
    `SELECT id FROM calls WHERE video_id = ANY($1::int[])`,
    [touchedVideoIds],
  );
  await recomputeDerivedFields(touchedCallRows.map((row) => row.id));
  await recomputeAllStats();

  console.log(
    `[${timestamp()}] Re-extraction and rebuild complete for ${videos.length} videos`,
  );
}

main().catch((error) => {
  console.error(`[${timestamp()}] Fatal error:`, error);
  process.exit(1);
});
