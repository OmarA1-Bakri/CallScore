import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "../lib/db";
import { writeJsonlRecord } from "../lib/shadow-extraction";
import { loadEnv, sleep, timestamp } from "./script-helpers";

const execFileAsync = promisify(execFile);

export interface BackfillTranscriptsArgs {
  readonly creator: string | null;
  readonly limit: number;
  readonly offset: number;
  readonly concurrency: number;
  readonly gapMs: number;
  readonly fallbackYtDlp: boolean;
  readonly write: boolean;
  readonly auditOut: string | null;
}

interface MissingTranscriptVideo {
  readonly id: number;
  readonly creator_id: number;
  readonly youtube_video_id: string;
  readonly title: string | null;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly published_at: string | null;
}

interface TranscriptResult {
  readonly text: string;
  readonly quality: number;
  readonly source: "serpapi" | "yt-dlp";
  readonly detail?: string;
}

interface TranscriptFailure {
  readonly reason: "provider_credentials_missing" | "providers_returned_no_transcript";
  readonly status: "failed";
  readonly provider: "none" | "serpapi+yt-dlp" | "serpapi" | "yt-dlp";
}

type TranscriptFetch =
  | { readonly ok: true; readonly transcript: TranscriptResult }
  | { readonly ok: false; readonly failure: TranscriptFailure };

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseBackfillTranscriptsArgs(argv = process.argv.slice(2)): BackfillTranscriptsArgs {
  return {
    creator: argValue(argv, "--creator"),
    limit: positiveInt(argValue(argv, "--limit"), 100),
    offset: Math.max(0, positiveInt(argValue(argv, "--offset"), 0)),
    concurrency: Math.min(50, positiveInt(argValue(argv, "--concurrency"), 5)),
    gapMs: Math.max(0, positiveInt(argValue(argv, "--gap-ms"), 0)),
    fallbackYtDlp: argv.includes("--fallback-yt-dlp"),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

function serpApiKey(): string | null {
  return process.env.SERPAPI_API_KEY
    ?? process.env.SERPAPI_TOKEN
    ?? process.env.SERPAI_TOKEN
    ?? process.env.SERP_API_KEY
    ?? process.env.SERPAPI_KEY
    ?? null;
}

function transcriptQuality(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 50) return 0.1;
  if (words < 200) return 0.35;
  if (words < 500) return 0.65;
  return Math.min(1, 0.75 + Math.min(0.25, words / 4000));
}

function textFromSerpApi(data: unknown): string {
  const obj = data as { transcript?: readonly { snippet?: string; text?: string }[] };
  return (obj.transcript ?? [])
    .map((item) => item.snippet ?? item.text ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchViaSerpApi(videoId: string): Promise<TranscriptResult | null> {
  const key = serpApiKey();
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "youtube_video_transcript");
  url.searchParams.set("v", videoId);
  url.searchParams.set("language_code", "en");
  url.searchParams.set("type", "asr");
  url.searchParams.set("output", "json");
  url.searchParams.set("api_key", key);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data as { error?: string } | null)?.error) return null;
    const text = textFromSerpApi(data);
    if (text.length < 200) return null;
    return {
      text,
      quality: transcriptQuality(text),
      source: "serpapi",
      detail: `segments=${Array.isArray((data as { transcript?: unknown }).transcript) ? (data as { transcript: unknown[] }).transcript.length : 0}`,
    };
  } catch {
    return null;
  }
}

export function stripCaptionText(text: string): string {
  return text
    .replace(/^WEBVTT.*$/gm, "")
    .replace(/^Kind:.*$/gm, "")
    .replace(/^Language:.*$/gm, "")
    .replace(/^\d+$/gm, "")
    .replace(/^\d\d:\d\d:\d\d[.,]\d+\s+-->.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRequestedSubtitleUrl(text: string): string | null {
  const match = text.match(/['"]url['"]:\s*['"]([^'"]+)['"]/);
  return match?.[1].replace(/\\u0026/g, "&") ?? null;
}

export function ytDlpAuthArgs(env: Record<string, string | undefined> = process.env): string[] {
  const cookies = env.YTDLP_COOKIES_PATH ?? env.YTDLP_COOKIES ?? null;
  if (cookies) return ["--cookies", cookies];
  const browser = env.YTDLP_COOKIES_FROM_BROWSER ?? null;
  if (browser) return ["--cookies-from-browser", browser];
  return [];
}

async function fetchViaYtDlp(videoId: string): Promise<TranscriptResult | null> {
  try {
    const { stdout } = await execFileAsync(process.env.YTDLP_BIN ?? "yt-dlp", [
      ...ytDlpAuthArgs(),
      "--skip-download",
      "--no-warnings",
      "--quiet",
      "--write-auto-subs",
      "--write-subs",
      "--sub-langs",
      "en.*,en",
      "--sub-format",
      "vtt",
      "--print",
      "requested_subtitles",
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    const subtitleUrl = extractRequestedSubtitleUrl(stdout);
    const captionText = subtitleUrl
      ? await fetch(subtitleUrl, { signal: AbortSignal.timeout(20_000) }).then((response) => response.ok ? response.text() : "")
      : stdout;
    const text = stripCaptionText(captionText);
    if (text.length < 200) return null;
    return { text, quality: transcriptQuality(text), source: "yt-dlp" };
  } catch {
    return null;
  }
}

async function fetchTranscript(videoId: string, fallbackYtDlp: boolean): Promise<TranscriptFetch> {
  const hasSerp = Boolean(serpApiKey());
  if (hasSerp) {
    const serp = await fetchViaSerpApi(videoId);
    if (serp) return { ok: true, transcript: serp };
  }
  if (fallbackYtDlp) {
    const ytDlp = await fetchViaYtDlp(videoId);
    if (ytDlp) return { ok: true, transcript: ytDlp };
  }
  if (!hasSerp && !fallbackYtDlp) {
    return { ok: false, failure: { reason: "provider_credentials_missing", status: "failed", provider: "none" } };
  }
  return {
    ok: false,
    failure: {
      reason: "providers_returned_no_transcript",
      status: "failed",
      provider: hasSerp && fallbackYtDlp ? "serpapi+yt-dlp" : hasSerp ? "serpapi" : "yt-dlp",
    },
  };
}

async function markTranscriptFailure(videoId: number, failure: TranscriptFailure, write: boolean): Promise<void> {
  if (!write) return;
  await query(
    `UPDATE videos
     SET transcript_status = $2,
         transcript_provider = $3,
         transcript_error = $4,
         transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
         transcript_last_attempt_at = NOW()
     WHERE id = $1 AND (transcript IS NULL OR length(transcript) = 0)`,
    [videoId, failure.status, failure.provider, failure.reason],
  );
}

async function loadMissingTranscriptVideos(args: BackfillTranscriptsArgs): Promise<MissingTranscriptVideo[]> {
  const params: unknown[] = [];
  const filters = ["v.published_at IS NOT NULL", "(v.transcript IS NULL OR length(v.transcript) = 0)"];
  if (args.creator) {
    params.push(args.creator);
    filters.push(`lower(c.youtube_handle) = lower($${params.length})`);
  }
  params.push(args.limit, args.offset);
  return query<MissingTranscriptVideo>(
    `SELECT v.id, v.creator_id, v.youtube_video_id, v.title, v.published_at, c.name AS creator_name, c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE ${filters.join(" AND ")}
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
}

function audit(args: BackfillTranscriptsArgs, row: Record<string, unknown>): void {
  if (!args.auditOut) return;
  writeJsonlRecord(args.auditOut, row);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseBackfillTranscriptsArgs(argv);
  const videos = await loadMissingTranscriptVideos(args);
  console.log(`[${timestamp()}] transcript backfill ${args.write ? "WRITE" : "DRY-RUN"}: videos=${videos.length}, limit=${args.limit}, offset=${args.offset}, concurrency=${args.concurrency}`);

  let written = 0;
  let failed = 0;
  for (let index = 0; index < videos.length; index += args.concurrency) {
    const chunk = videos.slice(index, index + args.concurrency);
    const results = await Promise.all(chunk.map(async (video) => ({
      video,
      transcript: await fetchTranscript(video.youtube_video_id, args.fallbackYtDlp),
    })));

    for (const { video, transcript } of results) {
      if (!transcript.ok) {
        failed++;
        await markTranscriptFailure(video.id, transcript.failure, args.write);
        audit(args, {
          record_type: "transcript_backfill",
          ts: timestamp(),
          mode: args.write ? "WRITE" : "DRY",
          status: transcript.failure.status,
          reason: transcript.failure.reason,
          provider: transcript.failure.provider,
          video_id: video.id,
          creator_id: video.creator_id,
          youtube_video_id: video.youtube_video_id,
          creator: video.youtube_handle,
        });
        console.log(`[${timestamp()}] ${transcript.failure.status} ${video.youtube_video_id} ${video.creator_name} reason=${transcript.failure.reason}`);
        continue;
      }

      if (args.write) {
        await query(
          `UPDATE videos
           SET transcript = $1, transcript_quality = $2, calls_extracted = false,
               transcript_status = 'available', transcript_provider = $4, transcript_error = NULL,
               transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
               transcript_last_attempt_at = NOW()
           WHERE id = $3 AND (transcript IS NULL OR length(transcript) = 0)`,
          [transcript.transcript.text, transcript.transcript.quality, video.id, transcript.transcript.source],
        );
      }
      written++;
      audit(args, {
        record_type: "transcript_backfill",
        ts: timestamp(),
        mode: args.write ? "WRITE" : "DRY",
        status: args.write ? "updated" : "would_update",
        video_id: video.id,
        creator_id: video.creator_id,
        youtube_video_id: video.youtube_video_id,
        creator: video.youtube_handle,
        transcript_chars: transcript.transcript.text.length,
        transcript_quality: transcript.transcript.quality,
        source: transcript.transcript.source,
        detail: transcript.transcript.detail,
      });
      console.log(`[${timestamp()}] ${args.write ? "updated" : "would-update"} ${video.youtube_video_id} source=${transcript.transcript.source} chars=${transcript.transcript.text.length}`);
    }

    if (args.gapMs > 0 && index + args.concurrency < videos.length) await sleep(args.gapMs);
  }

  console.log(`[${timestamp()}] transcript backfill complete: ${written} ${args.write ? "updated" : "would-update"}, ${failed} terminal`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
