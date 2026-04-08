import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { query } from "../lib/db";

const execFileAsync = promisify(execFile);

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

/**
 * Fetch the upload date via Invidious public API (fast path).
 * Returns ISO date string or null if Invidious cannot deliver.
 */
async function fetchViaInvidious(videoId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`https://invidious.f5.si/api/v1/videos/${videoId}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { published?: number };
    if (typeof data.published !== "number") return null;
    return new Date(data.published * 1000).toISOString();
  } catch {
    return null;
  }
}

/**
 * Fetch the upload date via yt-dlp (reliable fallback).
 * yt-dlp handles YouTube's bot detection internally.
 * Returns ISO date string (midnight UTC) or null.
 */
async function fetchViaYtDlp(videoId: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--skip-download",
        "--no-warnings",
        "--quiet",
        "--print",
        "%(upload_date)s",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 30000 },
    );
    const raw = stdout.trim();
    if (!raw || raw === "NA" || raw.length !== 8) return null;
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    return `${year}-${month}-${day}T00:00:00Z`;
  } catch {
    return null;
  }
}

async function fetchUploadDate(videoId: string): Promise<string | null> {
  // Try fast path first
  const fast = await fetchViaInvidious(videoId);
  if (fast) return fast;
  // Fallback to yt-dlp (slower but reliable)
  return fetchViaYtDlp(videoId);
}

/**
 * Process a batch of videos concurrently (limited concurrency).
 */
async function processBatch(
  videos: readonly { id: number; youtube_video_id: string }[],
  concurrency: number,
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < videos.length; i += concurrency) {
    const chunk = videos.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (v) => {
        const date = await fetchUploadDate(v.youtube_video_id);
        return { id: v.id, date, vid: v.youtube_video_id };
      }),
    );

    for (const r of results) {
      if (r.date) {
        // Retry the DB update in case of transient connection drops
        let dbAttempts = 0;
        while (dbAttempts < 3) {
          try {
            await query("UPDATE videos SET published_at = $1 WHERE id = $2", [r.date, r.id]);
            updated++;
            break;
          } catch (err) {
            dbAttempts++;
            if (dbAttempts >= 3) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[${timestamp()}]   DB update failed for ${r.vid}: ${msg}`);
              failed++;
              break;
            }
            await new Promise((r2) => setTimeout(r2, 2000));
          }
        }
      } else {
        failed++;
      }
    }
  }

  return { updated, failed };
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Backfilling video publication dates...`);

  // Get all videos missing published_at
  const videos = await query<{ id: number; youtube_video_id: string }>(
    "SELECT id, youtube_video_id FROM videos WHERE published_at IS NULL ORDER BY id",
  );

  console.log(`[${timestamp()}] Found ${videos.length} videos needing dates`);

  if (videos.length === 0) {
    console.log(`[${timestamp()}] Nothing to backfill`);
    process.exit(0);
  }

  const CONCURRENCY = 6; // Mix of Invidious (fast) + yt-dlp (slower fallback)
  const BATCH_SIZE = 60;
  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(videos.length / BATCH_SIZE);

    console.log(`[${timestamp()}] Batch ${batchNum}/${totalBatches} (${batch.length} videos)...`);

    const { updated, failed } = await processBatch(batch, CONCURRENCY);
    totalUpdated += updated;
    totalFailed += failed;

    console.log(
      `[${timestamp()}]   Batch done: ${updated} updated, ${failed} failed (total: ${totalUpdated}/${videos.length})`,
    );

    // Small delay between batches
    if (i + BATCH_SIZE < videos.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[${timestamp()}] Date backfill complete: ${totalUpdated} updated, ${totalFailed} failed`);

  // Step 2: Update call_date on all calls to use video published_at
  console.log(`[${timestamp()}] Updating call dates from video published_at...`);
  const callResult = await query<{ count: string }>(
    `WITH updated AS (
      UPDATE calls SET call_date = v.published_at
      FROM videos v
      WHERE calls.video_id = v.id
        AND v.published_at IS NOT NULL
      RETURNING calls.id
    ) SELECT COUNT(*)::text as count FROM updated`,
  );
  console.log(`[${timestamp()}] Updated ${callResult[0]?.count ?? 0} call dates`);

  // Step 3: Reset price matching so it re-runs with correct dates
  console.log(`[${timestamp()}] Resetting price data for re-matching...`);
  await query(
    `UPDATE calls SET
      price_at_call = NULL, price_7d = NULL, price_30d = NULL, price_90d = NULL,
      btc_price_at_call = NULL, btc_price_7d = NULL, btc_price_30d = NULL, btc_price_90d = NULL,
      return_7d = NULL, return_30d = NULL, return_90d = NULL,
      alpha_7d = NULL, alpha_30d = NULL, alpha_90d = NULL,
      correct_direction = NULL, hit_target = NULL,
      regime_at_call = NULL, regime_difficulty = 1,
      score = 0`,
  );
  console.log(`[${timestamp()}] All calls reset for re-matching`);

  console.log(`[${timestamp()}] Done. Now run: npx tsx src/scripts/match-prices.ts`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
