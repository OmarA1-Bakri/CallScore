import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "../lib/db";
import { createLogger } from "../lib/logger";
import { DEFAULT_CANDLE_REFRESH_SYMBOLS, isValidCandleOpenTimeMs } from "./refresh-candles";
import { loadEnv, sleep } from "./script-helpers";

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: "backfill-candles-data-vision" });
const DATA_VISION_BASE = "https://data.binance.vision/data/spot/monthly/klines";
const INTERVAL = "1m";

export interface BulkBackfillArgs {
  readonly symbols: readonly string[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly write: boolean;
  readonly gapMs: number;
  readonly maxFilesPerSymbol: number;
}

interface CandleCsvRow {
  readonly open_time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
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
  return Array.from(new Set(value.split(",").map((part) => part.trim().toUpperCase()).filter(Boolean)));
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function parseBulkBackfillArgs(argv = process.argv.slice(2)): BulkBackfillArgs {
  return {
    symbols: normalizeSymbols(argValue(argv, "--symbols")),
    startMonth: argValue(argv, "--start-month") ?? "2021-03",
    endMonth: argValue(argv, "--end-month") ?? currentMonth(),
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    gapMs: positiveInt(argValue(argv, "--gap-ms"), 500),
    maxFilesPerSymbol: positiveInt(argValue(argv, "--max-files-per-symbol"), 6),
  };
}

function assertMonth(value: string, label: string): void {
  if (!/^\d{4}-\d{2}$/.test(value) || Number(value.slice(5, 7)) < 1 || Number(value.slice(5, 7)) > 12) {
    throw new Error(`${label} must be YYYY-MM`);
  }
}

export function enumerateMonths(startMonth: string, endMonth: string, maxMonths: number): readonly string[] {
  assertMonth(startMonth, "--start-month");
  assertMonth(endMonth, "--end-month");
  const months: string[] = [];
  const cursor = new Date(`${startMonth}-01T00:00:00.000Z`);
  const end = new Date(`${endMonth}-01T00:00:00.000Z`);
  while (cursor <= end && months.length < maxMonths) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function buildDataVisionMonthlyUrl(symbol: string, month: string): string {
  assertMonth(month, "month");
  const normalized = symbol.trim().toUpperCase();
  return `${DATA_VISION_BASE}/${normalized}/${INTERVAL}/${normalized}-${INTERVAL}-${month}.zip`;
}

export function parseDataVisionCsv(csv: string): readonly CandleCsvRow[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","))
    .filter((columns) => columns.length >= 6 && /^\d+$/.test(columns[0]))
    .map((columns) => ({
      open_time: Number(columns[0]),
      open: Number(columns[1]),
      high: Number(columns[2]),
      low: Number(columns[3]),
      close: Number(columns[4]),
      volume: Number(columns[5]),
    }))
    .filter((row) => isValidCandleOpenTimeMs(row.open_time) && Number.isFinite(row.close));
}

async function downloadZip(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (response.status === 404) throw new Error(`Missing Binance data.vision file: ${url}`);
  if (!response.ok) throw new Error(`Binance data.vision HTTP ${response.status}: ${await response.text()}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
}

async function unzipCsv(zipPath: string): Promise<string> {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath], { maxBuffer: 250 * 1024 * 1024 });
  return String(stdout);
}

async function insertCandles(symbol: string, candles: readonly CandleCsvRow[]): Promise<number> {
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

export async function runBulkBackfill(args: BulkBackfillArgs): Promise<Record<string, number>> {
  const tmp = await mkdtemp(join(tmpdir(), "ctr-data-vision-"));
  let files = 0;
  let fetchedCandles = 0;
  let insertedCandles = 0;
  try {
    for (const symbol of args.symbols) {
      for (const month of enumerateMonths(args.startMonth, args.endMonth, args.maxFilesPerSymbol)) {
        const url = buildDataVisionMonthlyUrl(symbol, month);
        files += 1;
        if (!args.write) {
          logger.info("bulk_backfill_dry_run_file", { symbol, month, url });
          continue;
        }
        const zipPath = join(tmp, `${symbol}-${month}.zip`);
        await downloadZip(url, zipPath);
        const candles = parseDataVisionCsv(await unzipCsv(zipPath));
        fetchedCandles += candles.length;
        insertedCandles += await insertCandles(symbol, candles);
        logger.info("bulk_backfill_file_complete", { symbol, month, candles: candles.length });
        if (args.gapMs > 0) await sleep(args.gapMs);
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { files, fetched_candles: fetchedCandles, inserted_candles: insertedCandles };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseBulkBackfillArgs(argv);
  const metrics = await runBulkBackfill(args);
  logger.info("bulk_backfill_complete", { ...metrics, write: args.write });
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("fatal_error", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exit(1);
  });
}
