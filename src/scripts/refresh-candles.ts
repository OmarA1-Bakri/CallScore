import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { query } from "../lib/db";
import { TRACKED_SYMBOLS } from "../lib/constants";
import { loadEnv, sleep, timestamp } from "./script-helpers";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const INTERVAL = "1m";
const BINANCE_LIMIT = 1000;
const MS_PER_MINUTE = 60_000;
const DEFAULT_START_DATE = "2021-03-01T00:00:00.000Z";

export const DEFAULT_CANDLE_REFRESH_SYMBOLS = Array.from(
  new Set([...TRACKED_SYMBOLS, "XLMUSDT"]),
);

interface CandleRefreshArgs {
  readonly symbols: readonly string[];
  readonly startDate: string;
  readonly endDate: string | null;
  readonly maxRequestsPerSymbol: number;
  readonly gapMs: number;
  readonly write: boolean;
  readonly auditOut: string | null;
}

interface CandleCoverageRow {
  readonly symbol: string;
  readonly max_time: string | null;
  readonly count: string;
}

interface Candle {
  readonly open_time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

interface FetchWindow {
  readonly startTime: number;
  readonly endTime: number;
}

interface SymbolRefreshResult {
  readonly symbol: string;
  readonly mode: "WRITE" | "DRY";
  readonly existing_latest: string | null;
  readonly target_end: string;
  readonly request_count: number;
  readonly fetched_candles: number;
  readonly inserted_candles: number;
  readonly status: "completed" | "skipped" | "failed";
  readonly error?: string;
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

function normalizeSymbols(value: string | null): readonly string[] {
  if (!value) return DEFAULT_CANDLE_REFRESH_SYMBOLS;
  const symbols = value
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(symbols));
}

function parseDateMs(value: string, label: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${label} must be an ISO-compatible date`);
  return ms;
}

export function parseCandleRefreshArgs(argv = process.argv.slice(2)): CandleRefreshArgs {
  return {
    symbols: normalizeSymbols(argValue(argv, "--symbols")),
    startDate: argValue(argv, "--start-date") ?? DEFAULT_START_DATE,
    endDate: argValue(argv, "--end-date"),
    maxRequestsPerSymbol: positiveInt(argValue(argv, "--max-requests-per-symbol"), 25),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 250),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    auditOut: argValue(argv, "--audit-out"),
  };
}

export function buildFetchWindows(input: {
  readonly latestOpenTime: number | null;
  readonly startDateMs: number;
  readonly endDateMs: number;
  readonly maxRequests: number;
}): FetchWindow[] {
  const windows: FetchWindow[] = [];
  let start = input.latestOpenTime === null
    ? input.startDateMs
    : Math.max(input.latestOpenTime + MS_PER_MINUTE, input.startDateMs);

  while (start <= input.endDateMs && windows.length < input.maxRequests) {
    const end = Math.min(input.endDateMs, start + (BINANCE_LIMIT - 1) * MS_PER_MINUTE);
    windows.push({ startTime: start, endTime: end });
    start = end + MS_PER_MINUTE;
  }

  return windows;
}

async function getCoverage(symbol: string): Promise<CandleCoverageRow> {
  const rows = await query<CandleCoverageRow>(
    `SELECT $1::text AS symbol, MAX(open_time)::text AS max_time, COUNT(*)::text AS count
     FROM candles
     WHERE symbol = $1`,
    [symbol],
  );
  return rows[0] ?? { symbol, max_time: null, count: "0" };
}

async function fetchKlines(symbol: string, window: FetchWindow): Promise<Candle[]> {
  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", INTERVAL);
  url.searchParams.set("startTime", String(window.startTime));
  url.searchParams.set("endTime", String(window.endTime));
  url.searchParams.set("limit", String(BINANCE_LIMIT));

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binance ${symbol} HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as unknown[][];
  return data.map((kline) => ({
    open_time: Number(kline[0]),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
  })).filter((candle) => Number.isFinite(candle.open_time) && Number.isFinite(candle.close));
}

async function insertCandles(symbol: string, candles: readonly Candle[]): Promise<number> {
  if (candles.length === 0) return 0;
  await query(
    `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::bigint[], $4::float8[],
       $5::float8[], $6::float8[], $7::float8[], $8::float8[]
     )
     ON CONFLICT (symbol, interval, open_time) DO NOTHING`,
    [
      candles.map(() => symbol),
      candles.map(() => INTERVAL),
      candles.map((candle) => candle.open_time),
      candles.map((candle) => candle.open),
      candles.map((candle) => candle.high),
      candles.map((candle) => candle.low),
      candles.map((candle) => candle.close),
      candles.map((candle) => candle.volume),
    ],
  );
  return candles.length;
}

function appendAudit(auditOut: string | null, result: SymbolRefreshResult): void {
  if (!auditOut) return;
  mkdirSync(dirname(auditOut), { recursive: true });
  appendFileSync(auditOut, `${JSON.stringify({ ts: timestamp(), ...result })}\n`);
}

async function refreshSymbol(symbol: string, args: CandleRefreshArgs): Promise<SymbolRefreshResult> {
  const coverage = await getCoverage(symbol);
  const latestOpenTime = coverage.max_time ? Number(coverage.max_time) : null;
  const endDateMs = args.endDate ? parseDateMs(args.endDate, "--end-date") : Date.now();
  const startDateMs = parseDateMs(args.startDate, "--start-date");
  const windows = buildFetchWindows({
    latestOpenTime,
    startDateMs,
    endDateMs,
    maxRequests: args.maxRequestsPerSymbol,
  });

  if (windows.length === 0) {
    return {
      symbol,
      mode: args.write ? "WRITE" : "DRY",
      existing_latest: coverage.max_time,
      target_end: new Date(endDateMs).toISOString(),
      request_count: 0,
      fetched_candles: 0,
      inserted_candles: 0,
      status: "skipped",
    };
  }

  let fetchedCandles = 0;
  let insertedCandles = 0;
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];
    const candles = args.write ? await fetchKlines(symbol, window) : [];
    fetchedCandles += candles.length;
    if (args.write) insertedCandles += await insertCandles(symbol, candles);
    if (args.gapMs > 0 && index < windows.length - 1) await sleep(args.gapMs);
  }

  return {
    symbol,
    mode: args.write ? "WRITE" : "DRY",
    existing_latest: coverage.max_time,
    target_end: new Date(endDateMs).toISOString(),
    request_count: windows.length,
    fetched_candles: fetchedCandles,
    inserted_candles: insertedCandles,
    status: "completed",
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseCandleRefreshArgs(argv);
  console.log(`[${timestamp()}] refresh-candles ${args.write ? "WRITE" : "DRY-RUN"}: symbols=${args.symbols.join(",")} maxRequestsPerSymbol=${args.maxRequestsPerSymbol}`);

  const results: SymbolRefreshResult[] = [];
  for (const symbol of args.symbols) {
    try {
      const result = await refreshSymbol(symbol, args);
      results.push(result);
      appendAudit(args.auditOut, result);
      console.log(`[${timestamp()}] ${symbol}: ${result.status} requests=${result.request_count} fetched=${result.fetched_candles} inserted=${result.inserted_candles}`);
    } catch (error) {
      const result: SymbolRefreshResult = {
        symbol,
        mode: args.write ? "WRITE" : "DRY",
        existing_latest: null,
        target_end: args.endDate ?? new Date().toISOString(),
        request_count: 0,
        fetched_candles: 0,
        inserted_candles: 0,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      appendAudit(args.auditOut, result);
      console.error(`[${timestamp()}] ${symbol}: failed ${result.error}`);
    }
    if (args.gapMs > 0) await sleep(args.gapMs);
  }

  const failed = results.filter((result) => result.status === "failed").length;
  console.log(`[${timestamp()}] refresh-candles complete: symbols=${results.length} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
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
