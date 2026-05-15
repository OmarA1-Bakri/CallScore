import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { query } from "../lib/db";
import { loadEnv, timestamp } from "./script-helpers";

export interface CoverageAuditArgs {
  readonly json: boolean;
  readonly out: string | null;
  readonly pretty: boolean;
}

export interface CoverageAuditSection<T = unknown> {
  readonly name: string;
  readonly rows: readonly T[];
}

export interface CoverageAuditReport {
  readonly generated_at: string;
  readonly sections: readonly CoverageAuditSection[];
}

export const COVERAGE_AUDIT_SECTION_NAMES = [
  "public_counts",
  "confidence_distribution",
  "video_creator_coverage",
  "creator_status_summary",
  "call_field_integrity",
  "market_candles",
  "market_symbol_gaps",
  "top_low_confidence_creators",
  "top_missing_price_creators",
] as const;

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

export function parseCoverageAuditArgs(argv = process.argv.slice(2)): CoverageAuditArgs {
  return {
    json: argv.includes("--json"),
    out: argValue(argv, "--out") ?? argValue(argv, "--audit-out"),
    pretty: !argv.includes("--compact"),
  };
}

export function coverageAuditQueries(): Record<(typeof COVERAGE_AUDIT_SECTION_NAMES)[number], string> {
  return {
    public_counts: `
      WITH flags AS (
        SELECT *,
          (price_at_call IS NOT NULL AND return_30d IS NOT NULL AND price_30d IS NOT NULL AND extraction_confidence >= 0.7 AND call_date <= NOW() - INTERVAL '30 days' AND (target_price IS NULL OR (call_date <= NOW() - INTERVAL '90 days' AND price_90d IS NOT NULL AND hit_target IS NOT NULL))) AS public_scored,
          (price_at_call IS NOT NULL AND return_30d IS NOT NULL AND price_30d IS NOT NULL AND call_date <= NOW() - INTERVAL '30 days' AND (target_price IS NULL OR (call_date <= NOW() - INTERVAL '90 days' AND price_90d IS NOT NULL AND hit_target IS NOT NULL))) AS score_ready_ignore_conf
        FROM calls
      )
      SELECT
        COUNT(*)::int AS tracked_calls,
        COUNT(*) FILTER (WHERE extraction_confidence >= 0.7)::int AS validated_calls,
        COUNT(*) FILTER (WHERE public_scored)::int AS public_scored_calls,
        COUNT(*) FILTER (WHERE extraction_confidence < 0.7)::int AS low_confidence_calls,
        COUNT(*) FILTER (WHERE score_ready_ignore_conf AND extraction_confidence < 0.7)::int AS score_ready_but_low_confidence,
        COUNT(*) FILTER (WHERE extraction_confidence >= 0.7 AND price_at_call IS NULL)::int AS validated_missing_price_at_call,
        COUNT(*) FILTER (WHERE extraction_confidence >= 0.7 AND price_at_call IS NOT NULL AND call_date <= NOW() - INTERVAL '30 days' AND (price_30d IS NULL OR return_30d IS NULL))::int AS validated_missing_30d,
        COUNT(*) FILTER (WHERE extraction_confidence >= 0.7 AND call_date > NOW() - INTERVAL '30 days')::int AS validated_pending_30d_horizon,
        COUNT(*) FILTER (WHERE extraction_confidence >= 0.7 AND target_price IS NOT NULL AND (call_date > NOW() - INTERVAL '90 days' OR price_90d IS NULL OR hit_target IS NULL))::int AS validated_target_pending_or_missing
      FROM flags;
    `,
    confidence_distribution: `
      SELECT extraction_confidence::text AS confidence, COUNT(*)::int AS calls
      FROM calls
      GROUP BY extraction_confidence
      ORDER BY calls DESC, confidence;
    `,
    video_creator_coverage: `
      WITH video_flags AS (
        SELECT v.*,
          (v.published_at IS NOT NULL) AS has_publication_date,
          (v.transcript IS NOT NULL AND length(v.transcript) > 0) AS has_transcript,
          (v.transcript IS NOT NULL AND length(v.transcript) > 0 AND v.transcript_quality > 0.2) AS extraction_eligible,
          EXISTS (SELECT 1 FROM calls c WHERE c.video_id = v.id) AS has_calls
        FROM videos v
      )
      SELECT
        COUNT(DISTINCT cr.id)::int AS creators,
        COUNT(*)::int AS videos,
        COUNT(*) FILTER (WHERE NOT has_publication_date)::int AS videos_missing_publication_date,
        COUNT(*) FILTER (WHERE NOT has_transcript)::int AS videos_missing_transcript,
        COUNT(*) FILTER (WHERE has_transcript AND transcript_quality <= 0.2)::int AS videos_low_quality_transcript,
        COUNT(*) FILTER (WHERE extraction_eligible)::int AS videos_extraction_eligible,
        COUNT(*) FILTER (WHERE extraction_eligible AND calls_extracted IS NOT TRUE)::int AS eligible_videos_not_marked_extracted,
        COUNT(*) FILTER (WHERE extraction_eligible AND NOT has_calls)::int AS eligible_videos_with_no_calls,
        COUNT(*) FILTER (WHERE extraction_eligible AND has_calls)::int AS eligible_videos_with_calls,
        COUNT(*) FILTER (WHERE calls_extracted IS TRUE)::int AS videos_marked_calls_extracted
      FROM video_flags vf
      JOIN creators cr ON cr.id = vf.creator_id;
    `,
    creator_status_summary: `
      WITH video_agg AS (
        SELECT creator_id,
          COUNT(*)::int AS total_videos,
          COUNT(*) FILTER (WHERE published_at IS NOT NULL)::int AS published_videos,
          COUNT(*) FILTER (WHERE transcript IS NOT NULL AND length(transcript)>0)::int AS transcript_videos,
          COUNT(*) FILTER (WHERE transcript IS NULL OR length(transcript)=0)::int AS missing_transcript_videos,
          COUNT(*) FILTER (WHERE transcript IS NOT NULL AND transcript_quality > 0.2)::int AS extraction_eligible_videos,
          COUNT(*) FILTER (WHERE transcript IS NOT NULL AND transcript_quality > 0.2 AND calls_extracted IS NOT TRUE)::int AS eligible_not_extracted
        FROM videos GROUP BY creator_id
      ), call_agg AS (
        SELECT creator_id,
          COUNT(*)::int AS calls,
          COUNT(*) FILTER (WHERE extraction_confidence >= 0.7)::int AS validated
        FROM calls GROUP BY creator_id
      )
      SELECT
        COUNT(*)::int AS creators,
        COUNT(*) FILTER (WHERE COALESCE(v.total_videos,0)=0)::int AS creators_no_videos,
        COUNT(*) FILTER (WHERE COALESCE(v.total_videos,0)>0 AND COALESCE(v.published_videos,0)<COALESCE(v.total_videos,0))::int AS creators_with_missing_publication_dates,
        COUNT(*) FILTER (WHERE COALESCE(v.missing_transcript_videos,0)>0)::int AS creators_with_missing_transcripts,
        COUNT(*) FILTER (WHERE COALESCE(v.eligible_not_extracted,0)>0)::int AS creators_with_eligible_unextracted_videos,
        COUNT(*) FILTER (WHERE COALESCE(c.calls,0)=0)::int AS creators_no_calls,
        COUNT(*) FILTER (WHERE COALESCE(c.validated,0)=0)::int AS creators_no_validated_calls
      FROM creators cr
      LEFT JOIN video_agg v ON v.creator_id=cr.id
      LEFT JOIN call_agg c ON c.creator_id=cr.id;
    `,
    call_field_integrity: `
      SELECT
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE symbol IS NULL OR symbol='')::int AS missing_symbol,
        COUNT(*) FILTER (WHERE direction IS NULL OR direction NOT IN ('bullish','bearish','neutral'))::int AS invalid_direction,
        COUNT(*) FILTER (WHERE call_date IS NULL)::int AS missing_call_date,
        COUNT(*) FILTER (WHERE raw_quote IS NULL OR length(raw_quote)=0)::int AS missing_raw_quote,
        COUNT(*) FILTER (WHERE specificity_score IS NULL)::int AS missing_specificity,
        COUNT(*) FILTER (WHERE extraction_confidence IS NULL)::int AS missing_extraction_confidence,
        COUNT(*) FILTER (WHERE confidence IS NULL OR confidence='')::int AS missing_confidence_label,
        COUNT(*) FILTER (WHERE price_at_call IS NULL)::int AS missing_price_at_call_all,
        COUNT(*) FILTER (WHERE call_date <= NOW() - INTERVAL '30 days' AND (price_30d IS NULL OR return_30d IS NULL))::int AS missing_30d_all_old,
        COUNT(*) FILTER (WHERE target_price IS NOT NULL AND call_date <= NOW() - INTERVAL '90 days' AND (price_90d IS NULL OR hit_target IS NULL))::int AS missing_target_outcome_all_old
      FROM calls;
    `,
    market_candles: `
      SELECT
        COUNT(DISTINCT symbol)::int AS symbols_with_candles,
        COUNT(*)::int AS candles,
        to_timestamp(MIN(open_time)/1000)::date::text AS min_date,
        to_timestamp(MAX(open_time)/1000)::date::text AS max_date,
        (NOW()::date - to_timestamp(MAX(open_time)/1000)::date)::int AS days_since_latest_candle
      FROM candles
      WHERE interval = '1m';
    `,
    market_symbol_gaps: `
      WITH call_symbols AS (SELECT DISTINCT symbol FROM calls),
      candle AS (
        SELECT symbol, to_timestamp(MIN(open_time)/1000)::date AS min_date, to_timestamp(MAX(open_time)/1000)::date AS max_date, COUNT(*) AS ct
        FROM candles
        WHERE interval = '1m'
        GROUP BY symbol
      )
      SELECT cs.symbol, COALESCE(c.ct,0)::int AS candles, c.min_date::text, c.max_date::text
      FROM call_symbols cs
      LEFT JOIN candle c ON c.symbol=cs.symbol
      WHERE c.symbol IS NULL OR c.max_date < NOW()::date - INTERVAL '2 days'
      ORDER BY candles ASC, cs.symbol
      LIMIT 100;
    `,
    top_low_confidence_creators: `
      SELECT cr.name, cr.youtube_handle,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE c.extraction_confidence < 0.7)::int AS low_confidence,
        COUNT(*) FILTER (WHERE c.extraction_confidence < 0.7 AND c.price_at_call IS NOT NULL AND c.return_30d IS NOT NULL AND c.price_30d IS NOT NULL AND c.call_date <= NOW() - INTERVAL '30 days' AND (c.target_price IS NULL OR (c.call_date <= NOW() - INTERVAL '90 days' AND c.price_90d IS NOT NULL AND c.hit_target IS NOT NULL)))::int AS ready_but_low_confidence
      FROM calls c
      JOIN creators cr ON cr.id=c.creator_id
      GROUP BY cr.name, cr.youtube_handle
      HAVING COUNT(*) FILTER (WHERE c.extraction_confidence < 0.7) > 0
      ORDER BY ready_but_low_confidence DESC, low_confidence DESC
      LIMIT 40;
    `,
    top_missing_price_creators: `
      SELECT cr.name, cr.youtube_handle,
        COUNT(*) FILTER (WHERE c.extraction_confidence >= 0.7 AND c.price_at_call IS NULL)::int AS validated_missing_price,
        COUNT(*) FILTER (WHERE c.extraction_confidence >= 0.7 AND c.price_at_call IS NOT NULL AND c.call_date <= NOW() - INTERVAL '30 days' AND (c.price_30d IS NULL OR c.return_30d IS NULL))::int AS validated_missing_30d,
        COUNT(*) FILTER (WHERE c.extraction_confidence >= 0.7 AND c.target_price IS NOT NULL AND (c.call_date > NOW() - INTERVAL '90 days' OR c.price_90d IS NULL OR c.hit_target IS NULL))::int AS validated_target_pending_or_missing
      FROM calls c
      JOIN creators cr ON cr.id=c.creator_id
      GROUP BY cr.name, cr.youtube_handle
      HAVING COUNT(*) FILTER (WHERE c.extraction_confidence >= 0.7 AND (c.price_at_call IS NULL OR (c.price_at_call IS NOT NULL AND c.call_date <= NOW() - INTERVAL '30 days' AND (c.price_30d IS NULL OR c.return_30d IS NULL)) OR (c.target_price IS NOT NULL AND (c.call_date > NOW() - INTERVAL '90 days' OR c.price_90d IS NULL OR c.hit_target IS NULL)))) > 0
      ORDER BY validated_missing_price DESC, validated_missing_30d DESC
      LIMIT 40;
    `,
  };
}

export async function buildCoverageAuditReport(now = timestamp()): Promise<CoverageAuditReport> {
  const queries = coverageAuditQueries();
  const sections: CoverageAuditSection[] = [];
  for (const name of COVERAGE_AUDIT_SECTION_NAMES) {
    sections.push({ name, rows: await query<unknown>(queries[name]) });
  }
  return { generated_at: now, sections };
}

function summarizeReport(report: CoverageAuditReport): Record<string, unknown> {
  const section = (name: string) => report.sections.find((entry) => entry.name === name)?.rows[0] ?? null;
  return {
    generated_at: report.generated_at,
    public_counts: section("public_counts"),
    video_creator_coverage: section("video_creator_coverage"),
    creator_status_summary: section("creator_status_summary"),
    call_field_integrity: section("call_field_integrity"),
    market_candles: section("market_candles"),
    market_symbol_gaps: report.sections.find((entry) => entry.name === "market_symbol_gaps")?.rows ?? [],
  };
}

function writeJson(filePath: string, value: unknown, pretty: boolean): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseCoverageAuditArgs(argv);
  const report = await buildCoverageAuditReport();
  if (args.out) writeJson(args.out, report, args.pretty);
  const output = args.json ? report : summarizeReport(report);
  console.log(JSON.stringify(output, null, args.pretty ? 2 : 0));
}

const isEntryPoint = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
