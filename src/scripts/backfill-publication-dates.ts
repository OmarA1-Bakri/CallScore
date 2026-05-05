import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "../lib/db";
import { writeJsonlRecord } from "../lib/shadow-extraction";
import { loadEnv, timestamp } from "./script-helpers";

const execFileAsync = promisify(execFile);

export interface BackfillPublicationDatesArgs {
  readonly creator: string | null;
  readonly limit: number;
  readonly offset: number;
  readonly concurrency: number;
  readonly write: boolean;
  readonly auditOut: string | null;
}

interface MissingDateVideo {
  readonly id: number;
  readonly creator_id: number;
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly creator_name: string;
  readonly youtube_handle: string;
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

export function parseBackfillPublicationDatesArgs(argv = process.argv.slice(2)): BackfillPublicationDatesArgs {
  return {
    creator: argValue(argv, "--creator"),
    limit: positiveInt(argValue(argv, "--limit"), 100),
    offset: Math.max(0, positiveInt(argValue(argv, "--offset"), 0)),
    concurrency: Math.min(10, positiveInt(argValue(argv, "--concurrency"), 4)),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

async function fetchViaInvidious(videoId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(`https://invidious.f5.si/api/v1/videos/${videoId}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = (await response.json()) as { published?: number };
    return typeof data.published === "number" ? new Date(data.published * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

async function fetchViaYtDlp(videoId: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      "--skip-download",
      "--no-warnings",
      "--quiet",
      "--print",
      "%(upload_date)s",
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 45_000 });
    const raw = stdout.trim();
    if (!/^\d{8}$/.test(raw)) return null;
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`;
  } catch {
    return null;
  }
}

async function fetchPublishedAt(videoId: string): Promise<{ publishedAt: string | null; source: string | null }> {
  const invidious = await fetchViaInvidious(videoId);
  if (invidious) return { publishedAt: invidious, source: "invidious" };
  const ytDlp = await fetchViaYtDlp(videoId);
  if (ytDlp) return { publishedAt: ytDlp, source: "yt-dlp" };
  return { publishedAt: null, source: null };
}

async function loadMissingDateVideos(args: BackfillPublicationDatesArgs): Promise<MissingDateVideo[]> {
  const params: unknown[] = [];
  const filters = ["v.published_at IS NULL"];
  if (args.creator) {
    params.push(args.creator);
    filters.push(`lower(c.youtube_handle) = lower($${params.length})`);
  }
  params.push(args.limit, args.offset);
  return query<MissingDateVideo>(
    `SELECT v.id, v.creator_id, v.youtube_video_id, v.title, c.name AS creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY v.id ASC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
}

function audit(args: BackfillPublicationDatesArgs, row: Record<string, unknown>): void {
  if (!args.auditOut) return;
  writeJsonlRecord(args.auditOut, row);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseBackfillPublicationDatesArgs(argv);
  const videos = await loadMissingDateVideos(args);
  console.log(`[${timestamp()}] publication-date backfill ${args.write ? "WRITE" : "DRY-RUN"}: videos=${videos.length}, limit=${args.limit}, offset=${args.offset}`);

  let updated = 0;
  let failed = 0;
  for (let i = 0; i < videos.length; i += args.concurrency) {
    const chunk = videos.slice(i, i + args.concurrency);
    const results = await Promise.all(chunk.map(async (video) => ({
      video,
      ...(await fetchPublishedAt(video.youtube_video_id)),
    })));

    for (const result of results) {
      if (!result.publishedAt) {
        failed++;
        audit(args, {
          record_type: "publication_date_backfill",
          ts: timestamp(),
          mode: args.write ? "WRITE" : "DRY",
          status: "missing_date",
          video_id: result.video.id,
          creator_id: result.video.creator_id,
          youtube_video_id: result.video.youtube_video_id,
          creator: result.video.youtube_handle,
        });
        console.log(`[${timestamp()}] missing-date ${result.video.youtube_video_id} ${result.video.creator_name}`);
        continue;
      }

      if (args.write) {
        await query("UPDATE videos SET published_at = $1 WHERE id = $2 AND published_at IS NULL", [
          result.publishedAt,
          result.video.id,
        ]);
        await query(
          "UPDATE calls SET call_date = $1 WHERE video_id = $2 AND (call_date IS NULL OR call_date <> $1)",
          [result.publishedAt, result.video.id],
        );
      }
      updated++;
      audit(args, {
        record_type: "publication_date_backfill",
        ts: timestamp(),
        mode: args.write ? "WRITE" : "DRY",
        status: args.write ? "updated" : "would_update",
        video_id: result.video.id,
        creator_id: result.video.creator_id,
        youtube_video_id: result.video.youtube_video_id,
        creator: result.video.youtube_handle,
        published_at: result.publishedAt,
        source: result.source,
      });
      console.log(`[${timestamp()}] ${args.write ? "updated" : "would-update"} ${result.video.youtube_video_id} source=${result.source}`);
    }
  }

  console.log(`[${timestamp()}] publication-date backfill complete: ${updated} ${args.write ? "updated" : "would-update"}, ${failed} failed`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
