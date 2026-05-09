import {
  DEFAULT_CANDLE_REFRESH_SYMBOLS,
  runCandleRefresh,
  type CandleRefreshArgs,
} from "../scripts/refresh-candles";
import {
  runMatchPrices,
  type MatchPricesArgs,
  type MatchPricesMetrics,
} from "../scripts/match-prices";
import { runComputeScores } from "../scripts/compute-scores";
import type { PipelineJob } from "./pipeline";

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function symbolsValue(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    const symbols = value
      .filter((symbol): symbol is string => typeof symbol === "string")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set(symbols));
  }
  if (typeof value === "string" && value.trim()) {
    const symbols = value
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set(symbols));
  }
  return DEFAULT_CANDLE_REFRESH_SYMBOLS;
}

export function candleRefreshArgsFromPayload(payload: Record<string, unknown>): CandleRefreshArgs {
  const dryRun = booleanValue(payload.dry_run, false);
  return {
    symbols: symbolsValue(payload.symbols),
    startDate: stringValue(payload.start_date, "2021-03-01T00:00:00.000Z"),
    endDate: nullableString(payload.end_date),
    maxRequestsPerSymbol: positiveInt(payload.max_requests_per_symbol, 25),
    gapMs: positiveInt(payload.gap_ms, 250),
    write: booleanValue(payload.write, true) && !dryRun,
    auditOut: nullableString(payload.audit_out),
  };
}

export function matchPricesArgsFromPayload(payload: Record<string, unknown>): MatchPricesArgs {
  return {
    rematchAll: booleanValue(payload.rematch_all, false),
    limit: positiveInt(payload.limit, 1000),
    batchSize: positiveInt(payload.batch_size, 200),
    startAfterId: nonNegativeInt(payload.start_after_id, 0),
  };
}

export async function runCandleRefreshJob(job: PipelineJob): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const args = candleRefreshArgsFromPayload(job.payload);
  const results = await runCandleRefresh(args);
  const failed = results.filter((result) => result.status === "failed").length;
  if (failed > 0) {
    throw new Error(`Candle refresh failed for ${failed} symbol(s)`);
  }
  return {
    mode: args.write ? "write" : "dry_run",
    symbols: results.length,
    request_count: results.reduce((sum, result) => sum + result.request_count, 0),
    fetched_candles: results.reduce((sum, result) => sum + result.fetched_candles, 0),
    inserted_candles: results.reduce((sum, result) => sum + result.inserted_candles, 0),
    skipped_symbols: results.filter((result) => result.status === "skipped").length,
    elapsed_ms: Date.now() - startedAt,
  };
}

export async function runMatchPricesJob(job: PipelineJob): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const result: MatchPricesMetrics = await runMatchPrices(matchPricesArgsFromPayload(job.payload));
  return {
    ...result,
    elapsed_ms: Date.now() - startedAt,
  };
}

export async function runComputeScoresJob(): Promise<Record<string, unknown>> {
  return runComputeScores();
}
