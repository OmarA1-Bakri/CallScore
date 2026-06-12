import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { query } from "../lib/db";
import { loadEnv, sleep } from "./script-helpers";
import { buildTranscriptIngestSql, transcriptQuality } from "./ingest-transcript-result";

const execFileAsync = promisify(execFile);
const DEFAULT_WORK_ROOT = "/tmp/callscore-media-work";

export interface MediaFallbackArgs {
  readonly limit: number;
  readonly sinceDays: number;
  readonly gapMs: number;
  readonly write: boolean;
  readonly workRoot: string;
  readonly minFreeGb: number;
  readonly maxFilesize: string;
  readonly maxDurationSeconds: number;
}

interface MediaWorkItem {
  readonly id: number;
  readonly youtube_video_id: string;
  readonly youtube_url: string;
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

export function parseMediaFallbackArgs(argv = process.argv.slice(2)): MediaFallbackArgs {
  return {
    limit: Math.min(25, positiveInt(argValue(argv, "--limit"), 1)),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 45),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 20_000),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    workRoot: argValue(argv, "--work-root") ?? DEFAULT_WORK_ROOT,
    minFreeGb: positiveInt(argValue(argv, "--min-free-gb"), 5),
    maxFilesize: argValue(argv, "--max-filesize") ?? "200M",
    maxDurationSeconds: positiveInt(argValue(argv, "--max-duration-seconds"), 3600),
  };
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync("/bin/sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function detectAsr(): Promise<"whisper" | "none"> {
  if (await commandExists("whisper")) return "whisper";
  return "none";
}

async function freeGb(path: string): Promise<number> {
  const { stdout } = await execFileAsync("df", ["-Pk", path], { timeout: 5000 });
  const lines = stdout.trim().split("\n");
  const cols = lines.at(-1)?.trim().split(/\s+/) ?? [];
  const availableKb = Number(cols[3] ?? 0);
  return availableKb / 1024 / 1024;
}

async function loadMediaWorklist(args: MediaFallbackArgs): Promise<MediaWorkItem[]> {
  return query<MediaWorkItem>(
    `SELECT v.id,
            v.youtube_video_id,
            'https://www.youtube.com/watch?v=' || v.youtube_video_id AS youtube_url,
            v.title,
            c.name AS creator_name,
            c.youtube_handle
     FROM videos v
     JOIN creators c ON c.id = v.creator_id
     WHERE v.youtube_video_id IS NOT NULL
       AND v.published_at IS NOT NULL
       AND v.published_at >= NOW() - ($1::int * INTERVAL '1 day')
       AND (v.transcript IS NULL OR length(v.transcript) = 0)
       AND COALESCE(v.transcript_status, 'pending') <> 'failed'
     ORDER BY v.published_at DESC NULLS LAST, v.id DESC
     LIMIT $2`,
    [args.sinceDays, args.limit],
  );
}

function findAudioFile(dir: string): string | null {
  const files = readdirSync(dir).map((file) => join(dir, file)).filter((file) => statSync(file).isFile());
  return files.find((file) => /\.(m4a|mp3|opus|webm|wav)$/i.test(file)) ?? null;
}

async function downloadAudio(item: MediaWorkItem, dir: string, args: MediaFallbackArgs): Promise<string> {
  const output = join(dir, "%(id)s.%(ext)s");
  await execFileAsync("yt-dlp", [
    "--no-playlist",
    "--extract-audio",
    "--audio-format", "m4a",
    "--max-filesize", args.maxFilesize,
    "--match-filter", `duration <= ${args.maxDurationSeconds}`,
    "--output", output,
    item.youtube_url,
  ], { timeout: Math.max(120_000, args.maxDurationSeconds * 1000) });
  const audio = findAudioFile(dir);
  if (!audio) throw new Error("audio_download_missing_output");
  return audio;
}

async function transcribeWithWhisper(audioPath: string, dir: string): Promise<string> {
  await execFileAsync("whisper", [audioPath, "--model", process.env.CALLSCORE_WHISPER_MODEL ?? "base", "--output_format", "txt", "--output_dir", dir], { timeout: 30 * 60_000 });
  const txt = readdirSync(dir).find((file) => file.endsWith(".txt"));
  if (!txt) throw new Error("asr_missing_text_output");
  const { readFileSync } = await import("node:fs");
  return readFileSync(join(dir, txt), "utf8").replace(/\s+/g, " ").trim();
}

export async function runMediaFallback(args: MediaFallbackArgs): Promise<readonly Record<string, unknown>[]> {
  mkdirSync(args.workRoot, { recursive: true });
  const availableGb = await freeGb(args.workRoot);
  if (availableGb < args.minFreeGb) {
    return [{ status: "blocked", reason: "disk_guard", availableGb, minFreeGb: args.minFreeGb }];
  }

  const asr = await detectAsr();
  if (asr === "none") {
    return [{ status: "blocked", reason: "asr_unavailable", required: "Install whisper or faster-whisper with model storage before media fallback can produce transcripts." }];
  }

  const items = await loadMediaWorklist(args);
  const results: Record<string, unknown>[] = [];
  for (const item of items) {
    const dir = join(args.workRoot, `run-${Date.now()}-${item.youtube_video_id}`);
    mkdirSync(dir, { recursive: true });
    try {
      const beforeGb = await freeGb(args.workRoot);
      const audio = await downloadAudio(item, dir, args);
      const transcript = await transcribeWithWhisper(audio, dir);
      if (transcript.length < 50) throw new Error("asr_transcript_too_short");
      if (args.write) {
        const statement = buildTranscriptIngestSql({
          video_id: item.id,
          youtube_video_id: item.youtube_video_id,
          status: "available",
          transcript,
          transcript_quality: transcriptQuality(transcript),
          provider: "hh_media_fallback_asr",
        });
        await query(statement.sql, [...statement.params]);
      }
      results.push({ status: args.write ? "updated" : "would_update", video_id: item.id, youtube_video_id: item.youtube_video_id, chars: transcript.length, beforeGb });
    } catch (error) {
      results.push({ status: "failed", video_id: item.id, youtube_video_id: item.youtube_video_id, reason: error instanceof Error ? error.message : String(error) });
      break;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    if (args.gapMs > 0) await sleep(args.gapMs);
  }
  return results;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseMediaFallbackArgs(argv);
  const results = await runMediaFallback(args);
  console.log(JSON.stringify({ mode: args.write ? "WRITE" : "DRY", args: { ...args, write: args.write }, results }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
