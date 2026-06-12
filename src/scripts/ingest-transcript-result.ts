import { readFileSync } from "node:fs";
import { stdin as input } from "node:process";
import { closeDatabasePoolForTests, query } from "../lib/db";
import { loadEnv } from "./script-helpers";

export type TranscriptIngestStatus = "available" | "failed";

export interface TranscriptIngestArgs {
  readonly input: string;
  readonly write: boolean;
  readonly overwrite: boolean;
}

export interface TranscriptIngestRecord {
  readonly video_id: number;
  readonly youtube_video_id: string;
  readonly status: TranscriptIngestStatus;
  readonly transcript?: string;
  readonly transcript_quality?: number;
  readonly provider?: string;
  readonly error?: string;
  readonly source?: string;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parseTranscriptIngestArgs(argv = process.argv.slice(2)): TranscriptIngestArgs {
  return {
    input: argValue(argv, "--input") ?? "-",
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    overwrite: argv.includes("--overwrite"),
  };
}

export function transcriptQuality(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 50) return 0.1;
  if (words < 200) return 0.35;
  if (words < 500) return 0.65;
  return Math.min(1, 0.75 + Math.min(0.25, words / 4000));
}

export function normalizeTranscriptIngestRecord(value: unknown): TranscriptIngestRecord {
  if (!value || typeof value !== "object") throw new Error("Transcript ingest record must be an object");
  const record = value as Record<string, unknown>;
  const videoId = Number(record.video_id ?? record.id);
  const youtubeVideoId = String(record.youtube_video_id ?? "").trim();
  const status = String(record.status ?? "available") as TranscriptIngestStatus;
  if (!Number.isInteger(videoId) || videoId <= 0) throw new Error("video_id must be a positive integer");
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(youtubeVideoId)) throw new Error("youtube_video_id is invalid");
  if (status !== "available" && status !== "failed") throw new Error("status must be available or failed");

  if (status === "available") {
    const transcript = String(record.transcript ?? "").replace(/\s+/g, " ").trim();
    if (transcript.length < 50) throw new Error("available transcript must contain at least 50 characters");
    return {
      video_id: videoId,
      youtube_video_id: youtubeVideoId,
      status,
      transcript,
      transcript_quality: typeof record.transcript_quality === "number" ? record.transcript_quality : transcriptQuality(transcript),
      provider: String(record.provider ?? record.source ?? "laptop_collector").slice(0, 80),
      source: typeof record.source === "string" ? record.source.slice(0, 80) : undefined,
    };
  }

  return {
    video_id: videoId,
    youtube_video_id: youtubeVideoId,
    status,
    error: String(record.error ?? "collector_failed").slice(0, 120),
    provider: String(record.provider ?? "laptop_collector").slice(0, 80),
  };
}

export function buildTranscriptIngestSql(record: TranscriptIngestRecord, overwrite = false): { readonly sql: string; readonly params: readonly unknown[] } {
  if (record.status === "available") {
    return {
      sql: `UPDATE videos
        SET transcript = $1,
            transcript_quality = $2,
            calls_extracted = false,
            transcript_status = 'available',
            transcript_provider = $3,
            transcript_error = NULL,
            transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
            transcript_last_attempt_at = NOW()
        WHERE id = $4
          AND youtube_video_id = $5
          AND ($6::boolean OR transcript IS NULL OR length(transcript) = 0)`,
      params: [record.transcript, record.transcript_quality, record.provider ?? "laptop_collector", record.video_id, record.youtube_video_id, overwrite],
    };
  }

  return {
    sql: `UPDATE videos
      SET transcript_status = 'failed',
          transcript_provider = $1,
          transcript_error = $2,
          transcript_attempts = COALESCE(transcript_attempts, 0) + 1,
          transcript_last_attempt_at = NOW()
      WHERE id = $3
        AND youtube_video_id = $4
        AND (transcript IS NULL OR length(transcript) = 0)`,
    params: [record.provider ?? "laptop_collector", record.error ?? "collector_failed", record.video_id, record.youtube_video_id],
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(path: string): Promise<string> {
  if (path === "-") return readStdin();
  return readFileSync(path, "utf8");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseTranscriptIngestArgs(argv);
  const raw = await readInput(args.input);
  const parsed = JSON.parse(raw) as unknown;
  const records = Array.isArray(parsed) ? parsed : [parsed];
  const normalized = records.map(normalizeTranscriptIngestRecord);
  let updated = 0;
  for (const record of normalized) {
    const statement = buildTranscriptIngestSql(record, args.overwrite);
    if (args.write) {
      const result = await query<{ row_count?: number }>(`WITH updated AS (${statement.sql} RETURNING 1) SELECT COUNT(*)::int AS row_count FROM updated`, [...statement.params]);
      updated += Number(result[0]?.row_count ?? 0);
    }
  }
  console.log(JSON.stringify({ mode: args.write ? "WRITE" : "DRY", records: normalized.length, updated }, null, 2));
}

if (require.main === module) {
  main()
    .then(async () => {
      await closeDatabasePoolForTests();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDatabasePoolForTests().catch(() => undefined);
      process.exit(1);
    });
}
