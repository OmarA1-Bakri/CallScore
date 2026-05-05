import { existsSync } from "node:fs";
import { query } from "../lib/db";
import { getPublicCounts } from "../lib/public-counts";
import {
  buildPipelineReadinessSummary,
  type CreatorCompletenessInput,
  type TerminalVideoAuditRecord,
} from "../lib/pipeline-readiness";
import {
  readJsonlFile,
  writeJsonFile,
  type ShadowDiffRecord,
  type ShadowExtractedCallRecord,
} from "../lib/shadow-extraction";
import { loadEnv, timestamp } from "./script-helpers";

interface PipelineReadinessArgs {
  readonly shadowIn: string | null;
  readonly diffIn: string | null;
  readonly promoteIn: string | null;
  readonly publicationDateAuditIn: string | null;
  readonly transcriptAuditIn: string | null;
  readonly runId: string | null;
  readonly auditOut: string | null;
  readonly failOnBlockers: boolean;
  readonly summary: boolean;
  readonly requireFullShadowRecheck: boolean;
}

interface PromotionAuditRecord {
  readonly record_type?: string;
  readonly run_id?: string;
  readonly phase?: string;
  readonly action?: string;
  readonly video?: { readonly id?: number; readonly creator_id?: number };
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parsePipelineReadinessArgs(argv = process.argv.slice(2)): PipelineReadinessArgs {
  return {
    shadowIn: argValue(argv, "--shadow-in"),
    diffIn: argValue(argv, "--diff-in"),
    promoteIn: argValue(argv, "--promote-in"),
    publicationDateAuditIn: argValue(argv, "--publication-date-audit-in"),
    transcriptAuditIn: argValue(argv, "--transcript-audit-in"),
    runId: argValue(argv, "--run-id"),
    auditOut: argValue(argv, "--audit-out"),
    failOnBlockers: argv.includes("--fail-on-blockers"),
    summary: argv.includes("--summary"),
    requireFullShadowRecheck: !argv.includes("--allow-partial-shadow"),
  };
}

async function enrichTerminalRecords(records: readonly TerminalVideoAuditRecord[]): Promise<TerminalVideoAuditRecord[]> {
  const missingCreatorVideoIds = Array.from(new Set(records
    .filter((record) => typeof record.creator_id !== "number")
    .map((record) => typeof record.video_id === "number" ? record.video_id : record.video?.id)
    .filter((id): id is number => typeof id === "number")));
  if (missingCreatorVideoIds.length === 0) return [...records];
  const rows = await query<{ id: number; creator_id: number }>(
    "SELECT id, creator_id FROM videos WHERE id = ANY($1::int[])",
    [missingCreatorVideoIds],
  );
  const creatorByVideo = new Map(rows.map((row) => [row.id, row.creator_id]));
  return records.map((record) => {
    if (typeof record.creator_id === "number") return record;
    const videoId = typeof record.video_id === "number" ? record.video_id : record.video?.id;
    const creatorId = typeof videoId === "number" ? creatorByVideo.get(videoId) : undefined;
    return typeof creatorId === "number" ? { ...record, creator_id: creatorId } : record;
  });
}

function readOptionalJsonl<T>(filePath: string | null): T[] {
  if (!filePath || !existsSync(filePath)) return [];
  return readJsonlFile<T>(filePath);
}

async function loadCreatorCompleteness(): Promise<CreatorCompletenessInput[]> {
  const rows = await query<{
    creator_id: number;
    creator_name: string;
    youtube_handle: string;
    total_videos: string | number;
    published_videos: string | number;
    transcript_videos: string | number;
    extraction_eligible_videos: string | number;
    missing_transcript_videos: string | number;
    low_quality_transcript_videos: string | number;
    production_calls: string | number;
  }>(
    `WITH video_agg AS (
       SELECT creator_id,
              COUNT(*) AS total_videos,
              COUNT(*) FILTER (WHERE published_at IS NOT NULL) AS published_videos,
              COUNT(*) FILTER (WHERE transcript IS NOT NULL AND length(transcript) > 0) AS transcript_videos,
              COUNT(*) FILTER (WHERE transcript IS NOT NULL AND transcript_quality > 0.2) AS extraction_eligible_videos,
              COUNT(*) FILTER (WHERE transcript IS NULL OR length(transcript) = 0) AS missing_transcript_videos,
              COUNT(*) FILTER (WHERE transcript IS NOT NULL AND transcript_quality <= 0.2) AS low_quality_transcript_videos
       FROM videos
       GROUP BY creator_id
     ), call_agg AS (
       SELECT creator_id, COUNT(*) AS production_calls
       FROM calls
       GROUP BY creator_id
     )
     SELECT c.id AS creator_id,
            c.name AS creator_name,
            c.youtube_handle,
            COALESCE(v.total_videos, 0) AS total_videos,
            COALESCE(v.published_videos, 0) AS published_videos,
            COALESCE(v.transcript_videos, 0) AS transcript_videos,
            COALESCE(v.extraction_eligible_videos, 0) AS extraction_eligible_videos,
            COALESCE(v.missing_transcript_videos, 0) AS missing_transcript_videos,
            COALESCE(v.low_quality_transcript_videos, 0) AS low_quality_transcript_videos,
            COALESCE(ca.production_calls, 0) AS production_calls
     FROM creators c
     LEFT JOIN video_agg v ON v.creator_id = c.id
     LEFT JOIN call_agg ca ON ca.creator_id = c.id
     ORDER BY c.youtube_handle ASC`,
  );

  return rows.map((row) => ({
    creator_id: row.creator_id,
    creator_name: row.creator_name,
    youtube_handle: row.youtube_handle,
    total_videos: Number(row.total_videos),
    published_videos: Number(row.published_videos),
    transcript_videos: Number(row.transcript_videos),
    extraction_eligible_videos: Number(row.extraction_eligible_videos),
    missing_transcript_videos: Number(row.missing_transcript_videos),
    low_quality_transcript_videos: Number(row.low_quality_transcript_videos),
    production_calls: Number(row.production_calls),
  }));
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parsePipelineReadinessArgs(argv);
  const extractionRecords = readOptionalJsonl<ShadowExtractedCallRecord>(args.shadowIn).filter(
    (record) => record.record_type === "shadow_extraction" && (!args.runId || record.run_id === args.runId),
  );
  const diffRecords = readOptionalJsonl<ShadowDiffRecord>(args.diffIn).filter(
    (record) => record.record_type === "shadow_diff" && (!args.runId || record.run_id === args.runId),
  );
  const promotionRecords = readOptionalJsonl<PromotionAuditRecord>(args.promoteIn).filter(
    (record) => record.record_type === "shadow_promotion" && (!args.runId || record.run_id === args.runId),
  );
  const terminalPublicationDateRecords = await enrichTerminalRecords(
    readOptionalJsonl<TerminalVideoAuditRecord>(args.publicationDateAuditIn).filter(
      (record) => record.record_type === "publication_date_backfill",
    ),
  );
  const terminalTranscriptRecords = await enrichTerminalRecords(
    readOptionalJsonl<TerminalVideoAuditRecord>(args.transcriptAuditIn).filter(
      (record) => record.record_type === "transcript_backfill",
    ),
  );

  const summary = buildPipelineReadinessSummary({
    generatedAt: timestamp(),
    publicCounts: await getPublicCounts(),
    creators: await loadCreatorCompleteness(),
    extractionRecords,
    diffRecords,
    promotionRecords,
    terminalPublicationDateRecords,
    terminalTranscriptRecords,
    requireFullShadowRecheck: args.requireFullShadowRecheck,
  });

  if (args.auditOut) writeJsonFile(args.auditOut, summary);
  console.log(JSON.stringify(args.summary
    ? {
        generated_at: summary.generated_at,
        creatorCompleteness: {
          creators: summary.creatorCompleteness.creators,
          byStatus: summary.creatorCompleteness.byStatus,
          incomplete: summary.creatorCompleteness.incomplete,
        },
        funnel: summary.funnel,
        shadow: summary.shadow,
        promotion: summary.promotion,
        terminalCoverage: summary.terminalCoverage,
        blockers: summary.blockers,
      }
    : summary, null, 2));

  if (args.failOnBlockers && summary.blockers.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
