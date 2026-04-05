import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { query } from "../lib/db";
import type { Creator } from "../lib/types";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const envPath = path.resolve(__dirname, "../../.env");
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

const TEMP_DIR = path.resolve(__dirname, "../../temp");

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function cleanTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) return;
  const files = fs.readdirSync(TEMP_DIR);
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Parse VTT subtitle content into clean plaintext.
 * Removes timestamps, metadata headers, deduplicates lines, strips HTML tags.
 */
function parseVtt(content: string): string {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (
      !line ||
      line.includes("-->") ||
      line.startsWith("WEBVTT") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:") ||
      line.startsWith("NOTE")
    ) {
      continue;
    }
    // Skip numeric-only lines (cue identifiers)
    if (/^\d+$/.test(line)) continue;

    const clean = line.replace(/<[^>]+>/g, "");
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      textLines.push(clean);
    }
  }
  return textLines.join("\n");
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
 * Fetch video list from a YouTube channel using yt-dlp.
 * Returns array of { id, title, uploadDate }.
 */
function fetchVideoList(
  handle: string,
): readonly { id: string; title: string; uploadDate: string | null }[] {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateAfter = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, "");

  try {
    const output = execSync(
      `yt-dlp --flat-playlist --print "%(id)s|||%(title)s|||%(upload_date)s" --dateafter ${dateAfter} "https://www.youtube.com/${handle}/videos"`,
      { encoding: "utf-8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] },
    );
    const results: { id: string; title: string; uploadDate: string | null }[] = [];
    for (const raw of output.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const [id, title, uploadDate] = line.split("|||");
      if (id && title) {
        results.push({
          id: id.trim(),
          title: title.trim(),
          uploadDate: uploadDate?.trim() || null,
        });
      }
    }
    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${timestamp()}] Failed to fetch video list for ${handle}: ${msg}`);
    return [];
  }
}

/**
 * Download auto-generated English subtitles for a single video.
 * Returns the VTT file path or null if unavailable.
 */
function downloadSubtitles(videoId: string): string | null {
  const outputTemplate = path.join(TEMP_DIR, videoId);
  try {
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "${outputTemplate}" "https://www.youtube.com/watch?v=${videoId}"`,
      { encoding: "utf-8", timeout: 60_000, stdio: ["pipe", "pipe", "pipe"] },
    );

    // yt-dlp may produce .en.vtt or .en-orig.vtt
    const possiblePaths = [
      `${outputTemplate}.en.vtt`,
      `${outputTemplate}.en-orig.vtt`,
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }

    // Check for any .vtt file with this video id
    const tempFiles = fs.readdirSync(TEMP_DIR);
    const vttFile = tempFiles.find((f) => f.startsWith(videoId) && f.endsWith(".vtt"));
    if (vttFile) return path.join(TEMP_DIR, vttFile);

    return null;
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
  console.log(`[${timestamp()}]   Found ${videos.length} videos in last 6 months`);

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

    // Download subtitles
    const vttPath = downloadSubtitles(video.id);
    if (!vttPath) {
      console.log(`[${timestamp()}]   No subtitles for: ${video.title} (${video.id})`);
      failed++;
      continue;
    }

    try {
      const vttContent = fs.readFileSync(vttPath, "utf-8");
      const transcript = parseVtt(vttContent);
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

      // Clean up VTT file
      try { fs.unlinkSync(vttPath); } catch { /* ignore */ }
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
  ensureTempDir();

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

  cleanTempDir();
  console.log(
    `[${timestamp()}] Scraping complete: ${totalScraped} scraped, ${totalSkipped} skipped, ${totalFailed} failed`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
