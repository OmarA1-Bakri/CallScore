import { appendFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../lib/db";
import { fetchNearestBinanceCandle, insertFetchedCandle } from "./binance-candle-fallback";
import { loadEnv, timestamp } from "./script-helpers";

const DEFAULT_MAX_TOLERANCE_MINUTES = 30;
const DEFAULT_BATCH_SIZE = 250;
const REPAIR_VERSION = "price_backfill_v1";

export interface RepairPriceAtCallArgs {
  readonly write: boolean;
  readonly limit: number;
  readonly batchSize: number;
  readonly startAfterId: number;
  readonly maxToleranceMinutes: number;
  readonly fetchBinance: boolean;
  readonly symbols: readonly string[];
  readonly auditOut: string | null;
}

interface MissingPriceCall {
  readonly id: number;
  readonly symbol: string;
  readonly call_date: string;
}

interface NearestCandleRow {
  readonly close: number | string;
  readonly regime: number | string | null;
  readonly open_time: number | string;
}

interface RepairCandidate {
  readonly close: number;
  readonly regime: number | null;
  readonly openTime: number;
  readonly deltaMs: number;
  readonly band: "exact_minute" | "within_5m" | "within_30m";
}

interface RepairResult {
  readonly id: number;
  readonly symbol: string;
  readonly call_date: string;
  readonly status: "repaired" | "would_repair" | "unresolved" | "invalid_call_date";
  readonly candle_open_time?: number;
  readonly delta_ms?: number;
  readonly tolerance_band?: RepairCandidate["band"];
  readonly price_at_call?: number;
  readonly source?: "local_candle" | "binance_fallback";
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

function nonNegativeInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function csv(value: string | null): readonly string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function parseRepairPriceAtCallArgs(
  argv = process.argv.slice(2),
): RepairPriceAtCallArgs {
  return {
    write: argv.includes("--write") && !argv.includes("--dry-run"),
    limit: positiveInt(argValue(argv, "--limit"), Number.MAX_SAFE_INTEGER),
    batchSize: positiveInt(argValue(argv, "--batch-size"), DEFAULT_BATCH_SIZE),
    startAfterId: nonNegativeInt(argValue(argv, "--start-after-id"), 0),
    maxToleranceMinutes: positiveInt(
      argValue(argv, "--max-tolerance-minutes"),
      DEFAULT_MAX_TOLERANCE_MINUTES,
    ),
    fetchBinance: argv.includes("--fetch-binance"),
    symbols: csv(argValue(argv, "--symbols")),
    auditOut: argValue(argv, "--audit-out"),
  };
}

export function toleranceBand(
  callDateMs: number,
  candleOpenTime: number,
): RepairCandidate["band"] | null {
  const deltaMs = Math.abs(candleOpenTime - callDateMs);
  if (Math.floor(candleOpenTime / 60_000) === Math.floor(callDateMs / 60_000)) {
    return "exact_minute";
  }
  if (deltaMs <= 5 * 60_000) return "within_5m";
  if (deltaMs <= 30 * 60_000) return "within_30m";
  return null;
}

function audit(args: RepairPriceAtCallArgs, result: RepairResult): void {
  if (!args.auditOut) return;
  mkdirSync(path.dirname(args.auditOut), { recursive: true });
  appendFileSync(
    args.auditOut,
    `${JSON.stringify({ ts: timestamp(), repair_version: REPAIR_VERSION, mode: args.write ? "WRITE" : "DRY", ...result })}\n`,
  );
}

async function loadMissingPriceCalls(
  args: RepairPriceAtCallArgs,
  startAfterId: number,
  remaining: number,
): Promise<MissingPriceCall[]> {
  const params: unknown[] = [startAfterId];
  const filters = ["id > $1", "price_at_call IS NULL"];
  if (args.symbols.length > 0) {
    params.push(args.symbols);
    filters.push(`symbol = ANY($${params.length}::text[])`);
  }
  params.push(Math.min(args.batchSize, remaining));
  return query<MissingPriceCall>(
    `SELECT id, symbol, call_date::text AS call_date
     FROM calls
     WHERE ${filters.join(" AND ")}
     ORDER BY id ASC
     LIMIT $${params.length}`,
    params,
  );
}

async function findNearestLocalCandle(
  symbol: string,
  callDateMs: number,
  maxToleranceMinutes: number,
): Promise<RepairCandidate | null> {
  const toleranceMs = maxToleranceMinutes * 60_000;
  const rows = await query<NearestCandleRow>(
    `SELECT close, regime, open_time
     FROM candles
     WHERE symbol = $1
       AND open_time BETWEEN $2::bigint AND $3::bigint
     ORDER BY ABS(open_time - $4::bigint), open_time DESC
     LIMIT 1`,
    [symbol, callDateMs - toleranceMs, callDateMs + toleranceMs, callDateMs],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const openTime = Number(row.open_time);
  const close = Number(row.close);
  const regime = row.regime === null ? null : Number(row.regime);
  if (!Number.isFinite(openTime) || !Number.isFinite(close)) return null;
  const band = toleranceBand(callDateMs, openTime);
  if (band === null) return null;
  return {
    close,
    regime: Number.isFinite(regime) ? regime : null,
    openTime,
    deltaMs: Math.abs(openTime - callDateMs),
    band,
  };
}

async function findNearestCandle(
  symbol: string,
  callDateMs: number,
  args: RepairPriceAtCallArgs,
): Promise<(RepairCandidate & { source: "local_candle" | "binance_fallback" }) | null> {
  const local = await findNearestLocalCandle(
    symbol,
    callDateMs,
    args.maxToleranceMinutes,
  );
  if (local) return { ...local, source: "local_candle" };
  if (!args.fetchBinance) return null;

  const toleranceMs = args.maxToleranceMinutes * 60_000;
  const fetched = await fetchNearestBinanceCandle({
    symbol,
    targetMs: callDateMs,
    toleranceMs,
  });
  if (!fetched) return null;
  const band = toleranceBand(callDateMs, fetched.open_time);
  if (band === null) return null;
  if (args.write) await insertFetchedCandle(symbol, fetched);
  return {
    close: fetched.close,
    regime: null,
    openTime: fetched.open_time,
    deltaMs: Math.abs(fetched.open_time - callDateMs),
    band,
    source: "binance_fallback",
  };
}

async function repairCall(
  call: MissingPriceCall,
  args: RepairPriceAtCallArgs,
): Promise<RepairResult> {
  const callDateMs = new Date(call.call_date).getTime();
  if (!Number.isFinite(callDateMs)) {
    return {
      id: call.id,
      symbol: call.symbol,
      call_date: call.call_date,
      status: "invalid_call_date",
    };
  }

  const candidate = await findNearestCandle(
    call.symbol,
    callDateMs,
    args,
  );
  if (!candidate) {
    return {
      id: call.id,
      symbol: call.symbol,
      call_date: call.call_date,
      status: "unresolved",
    };
  }

  if (args.write) {
    await query(
      `UPDATE calls
       SET price_at_call = $1,
           regime_at_call = COALESCE(regime_at_call, $2),
           price_repaired_by = $3,
           price_repair_tolerance_ms = $4,
           price_repaired_at = NOW(),
           price_repair_notes = jsonb_build_object(
             'band', $5::text,
             'candle_open_time', $6::bigint,
             'call_date_ms', $7::bigint,
             'delta_ms', $4::int,
             'source', $9::text
           )
       WHERE id = $8 AND price_at_call IS NULL`,
      [
        candidate.close,
        candidate.regime,
        REPAIR_VERSION,
        candidate.deltaMs,
        candidate.band,
        candidate.openTime,
        callDateMs,
        call.id,
        candidate.source,
      ],
    );
  }

  return {
    id: call.id,
    symbol: call.symbol,
    call_date: call.call_date,
    status: args.write ? "repaired" : "would_repair",
    candle_open_time: candidate.openTime,
    delta_ms: candidate.deltaMs,
    tolerance_band: candidate.band,
    price_at_call: candidate.close,
    source: candidate.source,
  };
}

export async function runRepairPriceAtCall(
  args: RepairPriceAtCallArgs,
): Promise<{
  readonly seen: number;
  readonly repaired: number;
  readonly unresolved: number;
  readonly invalidCallDate: number;
  readonly lastId: number;
}> {
  let seen = 0;
  let repaired = 0;
  let unresolved = 0;
  let invalidCallDate = 0;
  let lastId = args.startAfterId;

  while (seen < args.limit) {
    const remaining = args.limit - seen;
    const batch = await loadMissingPriceCalls(args, lastId, remaining);
    if (batch.length === 0) break;

    for (const call of batch) {
      const result = await repairCall(call, args);
      audit(args, result);
      seen += 1;
      lastId = call.id;
      if (result.status === "repaired" || result.status === "would_repair") repaired += 1;
      if (result.status === "unresolved") unresolved += 1;
      if (result.status === "invalid_call_date") invalidCallDate += 1;
    }

    console.log(
      `[${timestamp()}] price-at-call repair batch: seen=${seen} repaired=${repaired} unresolved=${unresolved} invalid=${invalidCallDate} lastId=${lastId}`,
    );

    if (batch.length < Math.min(args.batchSize, remaining)) break;
  }

  return { seen, repaired, unresolved, invalidCallDate, lastId };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseRepairPriceAtCallArgs(argv);
  console.log(
    `[${timestamp()}] price-at-call repair ${args.write ? "WRITE" : "DRY-RUN"}: limit=${args.limit} batchSize=${args.batchSize} maxToleranceMinutes=${args.maxToleranceMinutes} fetchBinance=${args.fetchBinance} symbols=${args.symbols.join(",") || "all"}`,
  );
  const summary = await runRepairPriceAtCall(args);
  console.log(JSON.stringify({ ...summary, write: args.write }, null, 2));
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
