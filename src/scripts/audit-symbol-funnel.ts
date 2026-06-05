import { appendFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../lib/db";
import {
  EXTRACTION_CONFIDENCE_THRESHOLD,
  getCallEligibilitySql,
  getScoreReadyIgnoringConfidenceSql,
} from "../lib/public-methodology";
import { loadEnv, timestamp } from "./script-helpers";

const DEFAULT_SYMBOLS = ["LINKUSDT", "NEARUSDT", "XRPUSDT"] as const;

export interface SymbolFunnelAuditArgs {
  readonly symbols: readonly string[];
  readonly json: boolean;
  readonly auditOut: string | null;
}

export interface SymbolFunnelRow {
  readonly symbol: string;
  readonly raw_calls: number;
  readonly high_confidence: number;
  readonly low_confidence: number;
  readonly score_ready_ignoring_confidence: number;
  readonly public_eligible: number;
  readonly low_confidence_score_ready: number;
  readonly missing_price_at_call: number;
  readonly missing_30d_eval: number;
  readonly missing_90d_target_eval: number;
  readonly validation_pending: number;
  readonly validation_promote: number;
  readonly validation_reject: number;
  readonly validation_review: number;
  readonly earliest_candle_open_time: number | null;
  readonly latest_candle_open_time: number | null;
  readonly candle_count: number;
  readonly public_conversion_pct: number;
  readonly score_ready_conversion_pct: number;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function csv(value: string | null, fallback: readonly string[]): readonly string[] {
  if (!value) return fallback;
  const parsed = value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

export function parseSymbolFunnelAuditArgs(
  argv = process.argv.slice(2),
): SymbolFunnelAuditArgs {
  return {
    symbols: csv(argValue(argv, "--symbols"), DEFAULT_SYMBOLS),
    json: argv.includes("--json") || argv.includes("--summary"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

export function buildSymbolFunnelSql(): string {
  const scoreReady = getScoreReadyIgnoringConfidenceSql("c");
  const publicEligible = getCallEligibilitySql("c");
  return `WITH selected_symbols AS (
      SELECT unnest($1::text[]) AS symbol
    ), call_stats AS (
      SELECT
        c.symbol,
        COUNT(*)::text AS raw_calls,
        COUNT(*) FILTER (WHERE c.extraction_confidence >= ${EXTRACTION_CONFIDENCE_THRESHOLD})::text AS high_confidence,
        COUNT(*) FILTER (WHERE c.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD})::text AS low_confidence,
        COUNT(*) FILTER (WHERE ${scoreReady})::text AS score_ready_ignoring_confidence,
        COUNT(*) FILTER (WHERE ${publicEligible})::text AS public_eligible,
        COUNT(*) FILTER (WHERE c.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD} AND ${scoreReady})::text AS low_confidence_score_ready,
        COUNT(*) FILTER (WHERE c.price_at_call IS NULL)::text AS missing_price_at_call,
        COUNT(*) FILTER (
          WHERE c.price_at_call IS NOT NULL
            AND c.call_date <= NOW() - INTERVAL '30 days'
            AND (c.price_30d IS NULL OR c.return_30d IS NULL)
        )::text AS missing_30d_eval,
        COUNT(*) FILTER (
          WHERE c.target_price IS NOT NULL
            AND c.call_date <= NOW() - INTERVAL '90 days'
            AND (c.price_90d IS NULL OR c.hit_target IS NULL)
        )::text AS missing_90d_target_eval,
        COUNT(*) FILTER (WHERE c.extraction_confidence < ${EXTRACTION_CONFIDENCE_THRESHOLD} AND c.low_confidence_validation_decision IS NULL)::text AS validation_pending,
        COUNT(*) FILTER (WHERE c.low_confidence_validation_decision = 'PROMOTE')::text AS validation_promote,
        COUNT(*) FILTER (WHERE c.low_confidence_validation_decision = 'REJECT')::text AS validation_reject,
        COUNT(*) FILTER (WHERE c.low_confidence_validation_decision = 'NEEDS_HUMAN_REVIEW')::text AS validation_review
      FROM calls c
      WHERE c.symbol = ANY($1::text[])
      GROUP BY c.symbol
    ), candle_stats AS (
      SELECT
        ca.symbol,
        MIN(ca.open_time)::text AS earliest_candle_open_time,
        MAX(ca.open_time)::text AS latest_candle_open_time,
        COUNT(*)::text AS candle_count
      FROM candles ca
      WHERE ca.symbol = ANY($1::text[])
      GROUP BY ca.symbol
    )
    SELECT
      s.symbol,
      COALESCE(cs.raw_calls, '0') AS raw_calls,
      COALESCE(cs.high_confidence, '0') AS high_confidence,
      COALESCE(cs.low_confidence, '0') AS low_confidence,
      COALESCE(cs.score_ready_ignoring_confidence, '0') AS score_ready_ignoring_confidence,
      COALESCE(cs.public_eligible, '0') AS public_eligible,
      COALESCE(cs.low_confidence_score_ready, '0') AS low_confidence_score_ready,
      COALESCE(cs.missing_price_at_call, '0') AS missing_price_at_call,
      COALESCE(cs.missing_30d_eval, '0') AS missing_30d_eval,
      COALESCE(cs.missing_90d_target_eval, '0') AS missing_90d_target_eval,
      COALESCE(cs.validation_pending, '0') AS validation_pending,
      COALESCE(cs.validation_promote, '0') AS validation_promote,
      COALESCE(cs.validation_reject, '0') AS validation_reject,
      COALESCE(cs.validation_review, '0') AS validation_review,
      cdl.earliest_candle_open_time,
      cdl.latest_candle_open_time,
      COALESCE(cdl.candle_count, '0') AS candle_count
    FROM selected_symbols s
    LEFT JOIN call_stats cs ON cs.symbol = s.symbol
    LEFT JOIN candle_stats cdl ON cdl.symbol = s.symbol
    ORDER BY public_eligible::bigint ASC, raw_calls::bigint DESC, s.symbol ASC`;
}

type RawSymbolFunnelRow = Omit<SymbolFunnelRow,
  | "raw_calls"
  | "high_confidence"
  | "low_confidence"
  | "score_ready_ignoring_confidence"
  | "public_eligible"
  | "low_confidence_score_ready"
  | "missing_price_at_call"
  | "missing_30d_eval"
  | "missing_90d_target_eval"
  | "validation_pending"
  | "validation_promote"
  | "validation_reject"
  | "validation_review"
  | "earliest_candle_open_time"
  | "latest_candle_open_time"
  | "candle_count"
  | "public_conversion_pct"
  | "score_ready_conversion_pct"
> & Record<string, string | number | null>;

export async function loadSymbolFunnelRows(
  symbols: readonly string[],
): Promise<SymbolFunnelRow[]> {
  const rows = await query<RawSymbolFunnelRow>(buildSymbolFunnelSql(), [symbols]);
  return rows.map((row) => {
    const rawCalls = toNumber(row.raw_calls);
    const publicEligible = toNumber(row.public_eligible);
    const scoreReady = toNumber(row.score_ready_ignoring_confidence);
    return {
      symbol: String(row.symbol),
      raw_calls: rawCalls,
      high_confidence: toNumber(row.high_confidence),
      low_confidence: toNumber(row.low_confidence),
      score_ready_ignoring_confidence: scoreReady,
      public_eligible: publicEligible,
      low_confidence_score_ready: toNumber(row.low_confidence_score_ready),
      missing_price_at_call: toNumber(row.missing_price_at_call),
      missing_30d_eval: toNumber(row.missing_30d_eval),
      missing_90d_target_eval: toNumber(row.missing_90d_target_eval),
      validation_pending: toNumber(row.validation_pending),
      validation_promote: toNumber(row.validation_promote),
      validation_reject: toNumber(row.validation_reject),
      validation_review: toNumber(row.validation_review),
      earliest_candle_open_time: nullableNumber(row.earliest_candle_open_time),
      latest_candle_open_time: nullableNumber(row.latest_candle_open_time),
      candle_count: toNumber(row.candle_count),
      public_conversion_pct: pct(publicEligible, rawCalls),
      score_ready_conversion_pct: pct(scoreReady, rawCalls),
    };
  });
}

function audit(args: SymbolFunnelAuditArgs, rows: readonly SymbolFunnelRow[]): void {
  if (!args.auditOut) return;
  mkdirSync(path.dirname(args.auditOut), { recursive: true });
  appendFileSync(
    args.auditOut,
    `${JSON.stringify({ ts: timestamp(), type: "symbol_funnel_audit", symbols: args.symbols, rows })}\n`,
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseSymbolFunnelAuditArgs(argv);
  const rows = await loadSymbolFunnelRows(args.symbols);
  audit(args, rows);
  if (args.json) {
    console.log(JSON.stringify({ generated_at: timestamp(), symbols: args.symbols, rows }, null, 2));
    return;
  }
  for (const row of rows) {
    console.log(
      `${row.symbol}: raw=${row.raw_calls} public=${row.public_eligible} (${row.public_conversion_pct}%) score_ready=${row.score_ready_ignoring_confidence} missing_price=${row.missing_price_at_call} missing_30d=${row.missing_30d_eval} validation_pending=${row.validation_pending} candles=${row.candle_count}`,
    );
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(`[${timestamp()}] Fatal error:`, error);
    process.exit(1);
  });
}
