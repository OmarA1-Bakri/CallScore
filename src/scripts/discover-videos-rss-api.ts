import { query } from "../lib/db";
import { createLogger } from "../lib/logger";
import type { Creator } from "../lib/types";
import { loadEnv, sleep } from "./script-helpers";

const logger = createLogger({ component: "discover-videos-rss-api" });
const YOUTUBE_API_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const FETCH_TIMEOUT_MS = 30_000;

export interface Args {
  readonly creator?: string;
  readonly source: "rss" | "youtube-api" | "auto";
  readonly limitCreators: number;
  readonly limitVideos: number;
  readonly sinceDays: number;
  readonly gapMs: number;
  readonly write: boolean;
}

type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;

export interface DiscoveredVideo {
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly published_at: string | null;
  readonly source: "rss" | "youtube-api";
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sourceValue(value: string | null): Args["source"] {
  if (value === "rss" || value === "youtube-api" || value === "auto") return value;
  return "rss";
}

export function parseRssApiDiscoveryArgs(argv = process.argv.slice(2)): Args {
  return {
    creator: argValue(argv, "--creator") ?? undefined,
    source: sourceValue(argValue(argv, "--source")),
    limitCreators: positiveInt(argValue(argv, "--limit-creators"), 5),
    limitVideos: positiveInt(argValue(argv, "--limit-videos"), 50),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 365),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 250),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
  };
}

function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function tagText(xml: string, tag: string): string | null {
  const escaped = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(xml);
  return match?.[1] ? unescapeXml(match[1].trim()) : null;
}

export function parseYouTubeRss(xml: string, limit: number): readonly DiscoveredVideo[] {
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g))
    .slice(0, limit)
    .map((match) => match[1])
    .map((entry) => ({
      youtube_video_id: tagText(entry, "yt:videoId") ?? "",
      title: tagText(entry, "title"),
      published_at: tagText(entry, "published"),
      source: "rss" as const,
    }))
    .filter((video) => video.youtube_video_id.length > 0);
}

function isRecent(publishedAt: string | null, sinceDays: number): boolean {
  if (!publishedAt) return false;
  const time = Date.parse(publishedAt);
  return Number.isFinite(time) && time >= Date.now() - sinceDays * 86_400_000;
}

async function loadCreators(args: Args): Promise<readonly Creator[]> {
  if (args.creator) {
    return query<Creator>(
      "SELECT * FROM creators WHERE lower(youtube_handle) = lower($1) OR youtube_channel_id = $1 ORDER BY id",
      [args.creator],
    );
  }
  return query<Creator>(
    "SELECT * FROM creators WHERE youtube_channel_id IS NOT NULL ORDER BY last_scraped_at NULLS FIRST, id LIMIT $1",
    [args.limitCreators],
  );
}

async function fetchWithTimeout(url: URL): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms: ${url.toString()}`);
    }
    throw error;
  }
}

async function fetchRssVideos(channelId: string, limit: number): Promise<readonly DiscoveredVideo[]> {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("channel_id", channelId);
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`YouTube RSS HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return parseYouTubeRss(await response.text(), limit);
}

async function fetchYouTubeApiVideos(channelId: string, args: Args): Promise<readonly DiscoveredVideo[]> {
  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key) throw new Error("YOUTUBE_DATA_API_KEY is required for --source youtube-api");
  const url = new URL(YOUTUBE_API_SEARCH_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(Math.min(args.limitVideos, 50)));
  url.searchParams.set("publishedAfter", new Date(Date.now() - args.sinceDays * 86_400_000).toISOString());
  url.searchParams.set("key", key);
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`YouTube Data API HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json() as {
    items?: readonly { id?: { videoId?: string }; snippet?: { title?: string; publishedAt?: string } }[];
  };
  return (payload.items ?? []).map((item) => ({
    youtube_video_id: item.id?.videoId ?? "",
    title: item.snippet?.title ?? null,
    published_at: item.snippet?.publishedAt ?? null,
    source: "youtube-api" as const,
  })).filter((video) => video.youtube_video_id.length > 0);
}

async function discoverCreatorVideos(creator: Creator, args: Args): Promise<readonly DiscoveredVideo[]> {
  if (!creator.youtube_channel_id) return [];
  if (args.source === "rss") return fetchRssVideos(creator.youtube_channel_id, args.limitVideos);
  if (args.source === "youtube-api") return fetchYouTubeApiVideos(creator.youtube_channel_id, args);
  const rssVideos = await fetchRssVideos(creator.youtube_channel_id, args.limitVideos);
  if (rssVideos.length > 0 || !process.env.YOUTUBE_DATA_API_KEY) return rssVideos;
  return fetchYouTubeApiVideos(creator.youtube_channel_id, args);
}

export async function upsertVideo(
  creator: Creator,
  video: DiscoveredVideo,
  queryFn: QueryFn = query,
): Promise<void> {
  await queryFn(
    `INSERT INTO videos (
       creator_id, youtube_video_id, title, published_at,
       transcript, transcript_quality, calls_extracted,
       transcript_status, transcript_attempts, transcript_provider
     )
     VALUES ($1, $2, $3, $4, NULL, 0, false, 'pending', 0, NULL)
     ON CONFLICT (youtube_video_id) DO UPDATE SET
       creator_id = COALESCE(videos.creator_id, EXCLUDED.creator_id),
       title = COALESCE(EXCLUDED.title, videos.title),
       published_at = COALESCE(videos.published_at, EXCLUDED.published_at),
       transcript_status = CASE
         WHEN videos.transcript IS NOT NULL AND videos.transcript <> '' THEN 'available'
         ELSE COALESCE(videos.transcript_status, 'pending')
       END`,
    [creator.id, video.youtube_video_id, video.title, video.published_at],
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseRssApiDiscoveryArgs(argv);
  const creators = await loadCreators(args);
  let discovered = 0;
  let eligible = 0;
  let written = 0;

  for (const creator of creators) {
    try {
      const videos = await discoverCreatorVideos(creator, args);
      discovered += videos.length;
      for (const video of videos.filter((item) => isRecent(item.published_at, args.sinceDays))) {
        eligible += 1;
        if (args.write) {
          await upsertVideo(creator, video);
          written += 1;
        }
        logger.info(args.write ? "video_upserted" : "video_discovered", {
          creator_id: creator.id,
          youtube_video_id: video.youtube_video_id,
          source: video.source,
        });
      }
    } catch (error) {
      logger.error("discover_creator_videos_failed", {
        creator_id: creator.id,
        youtube_handle: creator.youtube_handle,
        youtube_channel_id: creator.youtube_channel_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (args.gapMs > 0) await sleep(args.gapMs);
  }

  logger.info("rss_api_discovery_complete", { creators: creators.length, discovered, eligible, written, write: args.write });
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("fatal_error", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exit(1);
  });
}
