import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { query } from "../lib/db";
import type { Creator } from "../lib/types";

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

/** Max videos to scrape per creator per run (most recent first). */
const MAX_VIDEOS_PER_CREATOR = 60;

interface ComposioResult<T> {
  readonly successful: boolean;
  readonly data?: T;
  readonly error?: string | { message?: string };
  readonly storedInFile?: boolean;
  readonly outputFilePath?: string;
}

interface SupadataChannelVideos {
  readonly video_ids?: readonly string[];
}

interface SupadataVideoMeta {
  readonly id: string;
  readonly title: string;
  readonly uploadDate?: string | null;
}

interface SupadataTranscriptChunk {
  readonly text: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function composioExecute<T>(slug: string, payload: object): ComposioResult<T> {
  const json = JSON.stringify(payload);
  const output = execSync(
    `composio execute ${slug} -d ${shellQuote(json)}`,
    { encoding: "utf-8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] },
  );
  const trimmed = output.trim();
  const start = trimmed.indexOf("{");
  if (start < 0) {
    throw new Error(`Could not parse composio response for ${slug}`);
  }
  return JSON.parse(trimmed.slice(start)) as ComposioResult<T>;
}

function extractComposioError(result: { error?: unknown }): string {
  if (typeof result.error === "string") return result.error;
  if (result.error && typeof result.error === "object") {
    const maybeMessage = (result.error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return "Unknown Composio error";
}

/**
 * Compute transcript quality score (0-1) based on:
 * - Line count (more = better, up to a point)
 * - Average word count per line
 * - Presence of noise markers like [Music], [Applause]
 */
function computeTranscriptQuality(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;

  // Line count component: 0-0.4 (100+ lines = max)
  const lineScore = Math.min(0.4, (lines.length / 100) * 0.4);

  // Average words per line: 0-0.4 (5+ avg words = max)
  const totalWords = lines.reduce((sum, l) => sum + l.split(/\s+/).length, 0);
  const avgWords = totalWords / lines.length;
  const wordScore = Math.min(0.4, (avgWords / 5) * 0.4);

  // Noise penalty: 0-0.2 deducted based on noise marker ratio
  const noiseMarkers = lines.filter(
    (l) =>
      l.includes("[Music]") ||
      l.includes("[Applause]") ||
      l.includes("[Laughter]") ||
      l.includes("[silence]"),
  ).length;
  const noiseRatio = noiseMarkers / lines.length;
  const noiseScore = Math.max(0, 0.2 - noiseRatio * 0.2);

  return Math.min(1, lineScore + wordScore + noiseScore);
}

/**
 * Fetch video list from a YouTube channel using Supadata via Composio.
 * Returns array of { id, title, uploadDate }.
 */
function fetchVideoList(
  handle: string,
): readonly { id: string; title: string; uploadDate: string | null }[] {
  try {
    const videos = composioExecute<SupadataChannelVideos>(
      "SUPADATA_GET_YOUTUBE_CHANNEL_VIDEOS",
      { channel_id: handle, type: "video", limit: MAX_VIDEOS_PER_CREATOR },
    );
    if (!videos.successful || !videos.data?.video_ids) {
      throw new Error(extractComposioError(videos));
    }

    const results: { id: string; title: string; uploadDate: string | null }[] = [];
    for (const videoId of videos.data.video_ids) {
      const meta = composioExecute<SupadataVideoMeta>(
        "SUPADATA_GET_YOUTUBE_VIDEO",
        { video_id: videoId },
      );
      if (!meta.successful || !meta.data) {
        console.error(`[${timestamp()}] Failed to fetch metadata for ${videoId}: ${extractComposioError(meta)}`);
        continue;
      }
      results.push({
        id: meta.data.id,
        title: meta.data.title,
        uploadDate: meta.data.uploadDate ?? null,
      });
    }

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    return results
      .filter((video) => !video.uploadDate || new Date(video.uploadDate) >= twelveMonthsAgo)
      .slice(0, MAX_VIDEOS_PER_CREATOR);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${timestamp()}] Failed to fetch video list for ${handle}: ${msg}`);
    return [];
  }
}

/**
 * Fetch transcript for a single video using Supadata via Composio.
 * Returns the joined transcript text or null if unavailable.
 */
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const result = composioExecute<{ content?: readonly SupadataTranscriptChunk[] | string }>(
      "SUPADATA_GET_TRANSCRIPT",
      { url: `https://youtu.be/${videoId}`, text: false, lang: "en" },
    );
    if (!result.successful) return null;

    let payload: { content?: readonly SupadataTranscriptChunk[] | string } | undefined = result.data;
    if (result.storedInFile && result.outputFilePath) {
      payload = JSON.parse(fs.readFileSync(result.outputFilePath, "utf-8"))?.data;
    }
    if (!payload) return null;

    if (typeof payload.content === "string") {
      return payload.content.trim() || null;
    }
    if (!Array.isArray(payload.content) || payload.content.length === 0) return null;
    const transcript = payload.content.map((i) => i.text).join(" ");
    return transcript.trim() || null;
  } catch {
    return null;
  }
}

function parseUploadDate(dateStr: string | null): string | null {
  if (!dateStr || dateStr.length !== 8) return null;
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}-${month}-${day}T00:00:00Z`;
}

async function processCreator(creator: Creator): Promise<{ scraped: number; skipped: number; failed: number }> {
  const handle = creator.youtube_handle;
  console.log(`[${timestamp()}] Fetching video list for ${creator.name} (${handle})...`);

  const videos = fetchVideoList(handle);
  console.log(`[${timestamp()}]   Found ${videos.length} videos in last 12 months`);

  let scraped = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of videos) {
    // Check if already in database
    const existing = await query<{ id: number }>(
      "SELECT id FROM videos WHERE youtube_video_id = $1",
      [video.id],
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Fetch transcript via Supadata/Composio
    const transcript = await fetchTranscript(video.id);
    if (!transcript) {
      console.log(`[${timestamp()}]   No subtitles for: ${video.title} (${video.id})`);
      failed++;
      continue;
    }

    try {
      const quality = computeTranscriptQuality(transcript);
      const publishedAt = parseUploadDate(video.uploadDate);

      await query(
        `INSERT INTO videos (creator_id, youtube_video_id, title, published_at, transcript, transcript_quality)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (youtube_video_id) DO NOTHING`,
        [creator.id, video.id, video.title, publishedAt, transcript, quality],
      );

      scraped++;
      console.log(`[${timestamp()}]   Scraped: ${video.title} (quality: ${quality.toFixed(2)})`);
    } catch (error: unknown) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}]   Error processing ${video.id}: ${msg}`);
    }
  }

  // Update last_scraped_at
  await query(
    "UPDATE creators SET last_scraped_at = NOW() WHERE id = $1",
    [creator.id],
  );

  return { scraped, skipped, failed };
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting transcript scraping...`);

  const creators = await query<Creator>("SELECT * FROM creators ORDER BY id");
  console.log(`[${timestamp()}] Found ${creators.length} creators`);

  let totalScraped = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const creator of creators) {
    try {
      const { scraped, skipped, failed } = await processCreator(creator);
      totalScraped += scraped;
      totalSkipped += skipped;
      totalFailed += failed;
      console.log(
        `[${timestamp()}] ${creator.name}: ${scraped} scraped, ${skipped} skipped, ${failed} failed`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Error processing ${creator.name}: ${msg}`);
    }
  }

  console.log(
    `[${timestamp()}] Scraping complete: ${totalScraped} scraped, ${totalSkipped} skipped, ${totalFailed} failed`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
