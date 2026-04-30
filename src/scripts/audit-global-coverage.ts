import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import {
  dedupeGlobalCreatorCandidates,
  getGlobalCreatorCandidates,
  normalizeCreatorHandle,
  summarizeGlobalCreatorCandidates,
  type GlobalCreatorCandidateWithSource,
} from "../lib/global-creator-candidates";

interface Args {
  readonly json: boolean;
  readonly includeDb: boolean;
}

interface DbCoverageRow {
  readonly youtube_handle: string;
  readonly videos: string | number;
  readonly videos_with_transcripts: string | number;
  readonly calls: string | number;
}

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL) return;
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
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: readonly string[]): Args {
  return {
    json: argv.includes("--json"),
    includeDb: !argv.includes("--no-db"),
  };
}

async function fetchDbCoverage(): Promise<Map<string, DbCoverageRow>> {
  loadEnv();
  const rows = await query<DbCoverageRow>(
    `WITH video_agg AS (
       SELECT creator_id,
              COUNT(*) AS videos,
              COUNT(*) FILTER (WHERE transcript IS NOT NULL AND length(transcript) > 0) AS videos_with_transcripts
       FROM videos
       GROUP BY creator_id
     ), call_agg AS (
       SELECT creator_id, COUNT(*) AS calls
       FROM calls
       GROUP BY creator_id
     )
     SELECT c.youtube_handle,
            COALESCE(v.videos, 0) AS videos,
            COALESCE(v.videos_with_transcripts, 0) AS videos_with_transcripts,
            COALESCE(ca.calls, 0) AS calls
     FROM creators c
     LEFT JOIN video_agg v ON v.creator_id = c.id
     LEFT JOIN call_agg ca ON ca.creator_id = c.id`,
  );
  return new Map(rows.map((row) => [normalizeCreatorHandle(row.youtube_handle) ?? row.youtube_handle, row]));
}

function countDbMatches(
  candidates: readonly GlobalCreatorCandidateWithSource[],
  dbCoverage: Map<string, DbCoverageRow>,
): { tracked: number; withTranscripts: number; withCalls: number } {
  let tracked = 0;
  let withTranscripts = 0;
  let withCalls = 0;
  for (const candidate of candidates) {
    const key = normalizeCreatorHandle(candidate.youtube_handle);
    if (!key) continue;
    const row = dbCoverage.get(key);
    if (!row) continue;
    tracked++;
    if (Number(row.videos_with_transcripts) > 0) withTranscripts++;
    if (Number(row.calls) > 0) withCalls++;
  }
  return { tracked, withTranscripts, withCalls };
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const candidates = dedupeGlobalCreatorCandidates(getGlobalCreatorCandidates());
  const summary = summarizeGlobalCreatorCandidates(candidates);
  let dbSummary: { tracked: number; withTranscripts: number; withCalls: number } | null = null;

  if (args.includeDb) {
    try {
      dbSummary = countDbMatches(candidates, await fetchDbCoverage());
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`DB coverage unavailable; continuing with source-only audit: ${msg}`);
    }
  }

  const payload = { ...summary, dbSummary };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log("Global creator universe audit");
  console.log(`Sources: ${summary.sourceCount}`);
  console.log(`Candidates: ${summary.candidateCount} rows / ${summary.uniqueCandidateCount} unique`);
  console.log(`Statuses: ${JSON.stringify(summary.statusCounts)}`);
  console.log(`Regions: ${JSON.stringify(summary.regionCounts)}`);
  console.log(`Languages: ${JSON.stringify(summary.languageCounts)}`);
  console.log(`Content types: ${JSON.stringify(summary.contentTypeCounts)}`);
  if (dbSummary) {
    console.log(`DB tracked from candidate set: ${dbSummary.tracked}`);
    console.log(`DB tracked with transcripts: ${dbSummary.withTranscripts}`);
    console.log(`DB tracked with calls: ${dbSummary.withCalls}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { parseArgs, countDbMatches };
