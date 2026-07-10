import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env.hermes', override: false });

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface PipelineAuditSummary {
  total_videos: string;
  with_transcript: string;
  missing_transcript: string;
  extracted: string;
  unextracted_have_transcript: string;
  price_matches: string;
  calls: string;
  creators: string;
  latest_video_published: string | null;
  stuck_jobs: Record<string, unknown>[];
}

async function scalar(runQuery: QueryFn, sql: string): Promise<string> {
  const rows = await runQuery<{ c: string }>(sql);
  return rows[0]?.c ?? '0';
}

async function providerNeutralQuery<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const database = await import('../src/lib/db');
  return database.query<T>(sql, params);
}

export async function collectPipelineAudit(runQuery: QueryFn = providerNeutralQuery): Promise<PipelineAuditSummary> {
  const columnRows = await runQuery<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'videos'");
  const columns = new Set(columnRows.map((row) => row.column_name));
  const transcriptColumn = columns.has('transcript_text') ? 'transcript_text' : columns.has('transcript') ? 'transcript' : null;
  const extractedColumn = columns.has('extracted_calls') ? 'extracted_calls' : columns.has('calls_extracted') ? 'calls_extracted' : null;
  if (!transcriptColumn || !extractedColumn) {
    throw new Error('videos schema is missing transcript or extraction audit columns');
  }
  const total_videos = await scalar(runQuery, 'SELECT COUNT(*)::text AS c FROM videos');
  const with_transcript = await scalar(runQuery, `SELECT COUNT(*)::text AS c FROM videos WHERE ${transcriptColumn} IS NOT NULL AND ${transcriptColumn} != ''`);
  const missing_transcript = await scalar(runQuery, `SELECT COUNT(*)::text AS c FROM videos WHERE ${transcriptColumn} IS NULL OR ${transcriptColumn} = ''`);
  const extracted = await scalar(runQuery, `SELECT COUNT(*)::text AS c FROM videos WHERE ${extractedColumn} IS NOT NULL`);
  const unextracted_have_transcript = await scalar(runQuery, `SELECT COUNT(*)::text AS c FROM videos WHERE ${extractedColumn} IS NULL AND ${transcriptColumn} IS NOT NULL AND ${transcriptColumn} != ''`);
  const priceTableRows = await runQuery<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('price_matches')");
  const hasPriceMatches = priceTableRows.some((row) => row.table_name === 'price_matches');
  const price_matches = await scalar(runQuery, hasPriceMatches ? 'SELECT COUNT(*)::text AS c FROM price_matches' : 'SELECT COUNT(*)::text AS c FROM calls WHERE entry_price IS NOT NULL');
  const calls = await scalar(runQuery, 'SELECT COUNT(*)::text AS c FROM calls');
  const creators = await scalar(runQuery, 'SELECT COUNT(*)::text AS c FROM creators');
  const latestRows = await runQuery<{ c: string | null }>('SELECT MAX(published_at)::text AS c FROM videos');
  const pipelineColumnRows = await runQuery<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'pipeline_jobs'");
  const pipelineColumns = new Set(pipelineColumnRows.map((row) => row.column_name));
  const jobNameColumn = pipelineColumns.has('name') ? 'name' : pipelineColumns.has('type') ? 'type' : null;
  const jobStartedColumn = pipelineColumns.has('started_at') ? 'started_at' : pipelineColumns.has('locked_at') ? 'locked_at' : 'created_at';
  if (!jobNameColumn) throw new Error('pipeline_jobs schema is missing name/type');
  const stuck_jobs = await runQuery<Record<string, unknown>>(`SELECT id, ${jobNameColumn} AS name, status, ${jobStartedColumn}::text AS started_at FROM pipeline_jobs WHERE status NOT IN ('completed', 'succeeded') ORDER BY id DESC LIMIT 10`);
  return {
    total_videos,
    with_transcript,
    missing_transcript,
    extracted,
    unextracted_have_transcript,
    price_matches,
    calls,
    creators,
    latest_video_published: latestRows[0]?.c ?? null,
    stuck_jobs,
  };
}

async function main() {
  const summary = await collectPipelineAudit();
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}:`, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
