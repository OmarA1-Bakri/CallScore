import { closeDatabasePoolForTests, query } from "../lib/db";
import { loadEnv } from "./script-helpers";

export interface TranscriptWorklistArgs {
  readonly limit: number;
  readonly sinceDays: number;
  readonly creator: string | null;
  readonly includeFailed: boolean;
}

export interface TranscriptWorkItem {
  readonly id: number;
  readonly creator_id: number;
  readonly youtube_video_id: string;
  readonly youtube_url: string;
  readonly title: string | null;
  readonly creator_name: string;
  readonly youtube_handle: string;
  readonly published_at: string | null;
  readonly transcript_status: string | null;
  readonly transcript_error: string | null;
  readonly transcript_priority: "official" | "provisional" | "watchlist" | "stale_repair" | "excluded_validation";
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

const prioritySql = `CASE
        WHEN lower(c.name) LIKE '%altcoin daily%'
          OR lower(replace(c.youtube_handle, '@', '')) IN ('alexbeckerschannel', 'moneyzg', 'cryptoinspector', 'altcoindaily')
          OR lower(COALESCE(c.focus, '')) ~ '(news|media|aggregation|aggregator)'
          THEN 5
        WHEN v.published_at < NOW() - INTERVAL '45 days' THEN 4
        WHEN COALESCE(cs90.total_calls, 0) >= 3 AND cs90.accuracy_rank IS NOT NULL THEN 1
        WHEN COALESCE(cs90.total_calls, 0) >= 1 THEN 2
        ELSE 3
      END`;

const priorityLabelSql = `CASE ${prioritySql}
        WHEN 1 THEN 'official'
        WHEN 2 THEN 'provisional'
        WHEN 3 THEN 'watchlist'
        WHEN 4 THEN 'stale_repair'
        ELSE 'excluded_validation'
      END`;

export function parseTranscriptWorklistArgs(argv = process.argv.slice(2)): TranscriptWorklistArgs {
  return {
    limit: Math.min(25, positiveInt(argValue(argv, "--limit"), 1)),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 45),
    creator: argValue(argv, "--creator"),
    includeFailed: argv.includes("--include-failed"),
  };
}

export function buildTranscriptWorklistSql(args: TranscriptWorklistArgs): { readonly sql: string; readonly params: readonly unknown[] } {
  const params: unknown[] = [args.sinceDays];
  const filters = [
    "v.youtube_video_id IS NOT NULL",
    "v.published_at IS NOT NULL",
    "v.published_at >= NOW() - ($1::int * INTERVAL '1 day')",
    "(v.transcript IS NULL OR length(v.transcript) = 0)",
  ];

  if (!args.includeFailed) {
    filters.push("COALESCE(v.transcript_status, 'pending') <> 'failed'");
  }

  if (args.creator) {
    params.push(args.creator);
    filters.push(`lower(c.youtube_handle) = lower($${params.length})`);
  }

  params.push(args.limit);
  return {
    sql: `SELECT
        v.id,
        v.creator_id,
        v.youtube_video_id,
        'https://www.youtube.com/watch?v=' || v.youtube_video_id AS youtube_url,
        v.title,
        c.name AS creator_name,
        c.youtube_handle,
        v.published_at::text AS published_at,
        v.transcript_status,
        v.transcript_error,
        ${priorityLabelSql} AS transcript_priority
      FROM videos v
      JOIN creators c ON c.id = v.creator_id
      LEFT JOIN creator_stats cs90 ON cs90.creator_id = c.id AND cs90.period = '90d'
      WHERE ${filters.join(" AND ")}
      ORDER BY ${prioritySql} ASC, v.published_at DESC NULLS LAST, v.id DESC
      LIMIT $${params.length}`,
    params,
  };
}

export async function loadTranscriptWorklist(args: TranscriptWorklistArgs): Promise<TranscriptWorkItem[]> {
  const statement = buildTranscriptWorklistSql(args);
  return query<TranscriptWorkItem>(statement.sql, [...statement.params]);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseTranscriptWorklistArgs(argv);
  const items = await loadTranscriptWorklist(args);
  process.stdout.write(`${JSON.stringify({ generated_at: new Date().toISOString(), args, items }, null, 2)}\n`);
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
