import { createGeminiModel, extractCallsFromTranscript } from "../lib/ai-extraction";
import { query } from "../lib/db";
import { recomputeDerivedFields } from "./rescore-derived";
import { recomputeAllStats } from "../lib/recompute-stats";
import {
  loadEnv,
  replaceStoredCallsForVideo,
  sleep,
  timestamp,
} from "./script-helpers";

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
  await replaceStoredCallsForVideo({
    creatorId: video.creator_id,
    videoId: video.id,
    callDate: video.published_at ?? video.created_at,
    calls: extractedCalls,
  });

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
