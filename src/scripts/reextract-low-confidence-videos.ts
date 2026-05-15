import { query } from "../lib/db";
import {
  loadEnv,
  timestamp,
} from "./script-helpers";
import { main as chunkedExtractorMain } from "./extract-calls-openrouter";

const REQUEST_GAP_MS = 4_000;
const STRONGER_PROVIDER = "ollama";
const STRONGER_MODEL = "kimi-k2.6";
const STRONGER_CHUNK_CHARS = 6_000;
const STRONGER_MAX_CHUNKS = 100;

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

function parseArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  const candidate = argv[index + 1];
  // Only treat as a value if it doesn't start with "--" (not another flag)
  if (candidate.startsWith("--")) return null;
  return candidate;
}

export function parseLowConfidenceReextractArgs(argv = process.argv.slice(2)): {
  readonly write: boolean;
  readonly limit: number;
  readonly creatorHandle: string | null;
  readonly videoId: number | null;
  readonly provider: string;
  readonly model: string;
  readonly chunkChars: number;
  readonly maxChunks: number;
} {
  const write = argv.includes("--write");
  const limit = Number(parseArgValue(argv, "--limit") ?? "50");
  const creatorHandle = parseArgValue(argv, "--creator");
  const videoIdValue = parseArgValue(argv, "--video");
  const videoId = videoIdValue ? parseInt(videoIdValue, 10) : null;
  const chunkCharsValue = Number(parseArgValue(argv, "--chunk-chars") ?? STRONGER_CHUNK_CHARS);
  const maxChunksValue = Number(parseArgValue(argv, "--max-chunks") ?? STRONGER_MAX_CHUNKS);
  return {
    write,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    creatorHandle,
    videoId,
    provider: parseArgValue(argv, "--provider") ?? STRONGER_PROVIDER,
    model: parseArgValue(argv, "--model") ?? STRONGER_MODEL,
    chunkChars: Number.isFinite(chunkCharsValue) && chunkCharsValue > 0 ? chunkCharsValue : STRONGER_CHUNK_CHARS,
    maxChunks: Number.isFinite(maxChunksValue) && maxChunksValue > 0 ? maxChunksValue : STRONGER_MAX_CHUNKS,
  };
}

async function loadVideos(args: ReturnType<typeof parseLowConfidenceReextractArgs>): Promise<LowConfidenceVideo[]> {
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

export function buildLowConfidenceReextractArgs(args: ReturnType<typeof parseLowConfidenceReextractArgs>, videoIds: readonly number[]): string[] {
  return [
    "--provider",
    args.provider,
    "--model",
    args.model,
    "--video-ids",
    videoIds.join(","),
    "--limit",
    String(videoIds.length),
    "--include-extracted",
    "--chunk-chars",
    String(args.chunkChars),
    "--max-chunks",
    String(args.maxChunks),
    "--gap-ms",
    String(REQUEST_GAP_MS),
    ...(args.write ? ["--write"] : ["--dry-run"]),
  ];
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseLowConfidenceReextractArgs(argv);
  const videos = await loadVideos(args);

  console.log(
    `[${timestamp()}] Loaded ${videos.length} low-confidence videos for re-extraction`,
  );

  const videoIds = videos.filter((video) => video.transcript?.trim()).map((video) => video.id);
  const extractorArgs = buildLowConfidenceReextractArgs(args, videoIds);
  console.log(`[${timestamp()}] Routing ${videoIds.length} low-confidence videos through chunked extractor provider=${args.provider} model=${args.model}`);
  await chunkedExtractorMain(extractorArgs);
  console.log(
    `[${timestamp()}] Re-extraction route complete for ${videoIds.length} videos`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${timestamp()}] Fatal error:`, error);
    process.exit(1);
  });
}
