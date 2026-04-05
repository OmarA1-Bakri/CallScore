import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { MS_7D, MS_30D, MS_90D } from "../lib/constants";
import {
  computeReturn,
  computeAlpha,
  isDirectionCorrect,
  didHitTarget,
  computeRegimeDifficulty,
} from "../lib/scoring";
import type { Call, Direction } from "../lib/types";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

interface CandleRow {
  readonly close: number;
}

interface RegimeRow {
  readonly regime: number;
}

interface HighLowRow {
  readonly max_high: number | null;
  readonly min_low: number | null;
}

/**
 * Look up the closest candle price at or before a given timestamp.
 */
async function getPriceAt(symbol: string, dateMs: number): Promise<number | null> {
  const isoDate = new Date(dateMs).toISOString();
  const rows = await query<CandleRow>(
    "SELECT close FROM candles WHERE symbol = $1 AND open_time <= $2 ORDER BY open_time DESC LIMIT 1",
    [symbol, isoDate],
  );
  return rows.length > 0 ? rows[0].close : null;
}

/**
 * Look up the market regime at a given timestamp.
 */
async function getRegimeAt(symbol: string, dateMs: number): Promise<number | null> {
  const isoDate = new Date(dateMs).toISOString();
  const rows = await query<RegimeRow>(
    "SELECT regime FROM candles WHERE symbol = $1 AND open_time <= $2 ORDER BY open_time DESC LIMIT 1",
    [symbol, isoDate],
  );
  return rows.length > 0 ? rows[0].regime : null;
}

/**
 * Get the highest high and lowest low between two timestamps.
 */
async function getHighLowBetween(
  symbol: string,
  fromMs: number,
  toMs: number,
): Promise<{ maxHigh: number | null; minLow: number | null }> {
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const rows = await query<HighLowRow>(
    "SELECT MAX(high) as max_high, MIN(low) as min_low FROM candles WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3",
    [symbol, fromIso, toIso],
  );
  if (rows.length === 0) return { maxHigh: null, minLow: null };
  return { maxHigh: rows[0].max_high, minLow: rows[0].min_low };
}

interface UnmatchedCall {
  readonly id: number;
  readonly symbol: string;
  readonly direction: string;
  readonly target_price: number | null;
  readonly call_date: string;
}

async function processCall(call: UnmatchedCall): Promise<boolean> {
  const callDateMs = new Date(call.call_date).getTime();
  if (isNaN(callDateMs)) {
    console.error(`[${timestamp()}]   Invalid call_date for call ${call.id}`);
    return false;
  }

  // Look up coin prices
  const priceAtCall = await getPriceAt(call.symbol, callDateMs);
  if (priceAtCall === null) {
    return false; // No candle data for this coin at this time
  }

  const price7d = await getPriceAt(call.symbol, callDateMs + MS_7D);
  const price30d = await getPriceAt(call.symbol, callDateMs + MS_30D);
  const price90d = await getPriceAt(call.symbol, callDateMs + MS_90D);

  // Look up BTC prices at same timestamps
  const btcPriceAtCall = await getPriceAt("BTCUSDT", callDateMs);
  const btcPrice7d = await getPriceAt("BTCUSDT", callDateMs + MS_7D);
  const btcPrice30d = await getPriceAt("BTCUSDT", callDateMs + MS_30D);
  const btcPrice90d = await getPriceAt("BTCUSDT", callDateMs + MS_90D);

  // Compute returns
  const return7d = price7d !== null ? computeReturn(priceAtCall, price7d) : null;
  const return30d = price30d !== null ? computeReturn(priceAtCall, price30d) : null;
  const return90d = price90d !== null ? computeReturn(priceAtCall, price90d) : null;

  // Compute BTC returns
  const btcReturn7d =
    btcPriceAtCall !== null && btcPrice7d !== null
      ? computeReturn(btcPriceAtCall, btcPrice7d)
      : null;
  const btcReturn30d =
    btcPriceAtCall !== null && btcPrice30d !== null
      ? computeReturn(btcPriceAtCall, btcPrice30d)
      : null;
  const btcReturn90d =
    btcPriceAtCall !== null && btcPrice90d !== null
      ? computeReturn(btcPriceAtCall, btcPrice90d)
      : null;

  // Compute alpha
  const alpha7d =
    return7d !== null && btcReturn7d !== null ? computeAlpha(return7d, btcReturn7d) : null;
  const alpha30d =
    return30d !== null && btcReturn30d !== null ? computeAlpha(return30d, btcReturn30d) : null;
  const alpha90d =
    return90d !== null && btcReturn90d !== null ? computeAlpha(return90d, btcReturn90d) : null;

  // Direction correctness (based on 30d return)
  const direction = call.direction as Direction;
  const correctDirection = return30d !== null ? isDirectionCorrect(direction, return30d) : null;

  // Target hit detection (check within 90d window)
  const { maxHigh, minLow } = await getHighLowBetween(
    call.symbol,
    callDateMs,
    callDateMs + MS_90D,
  );
  const hitTarget = didHitTarget(direction, call.target_price, maxHigh, minLow);

  // Regime at call time
  const regimeAtCall = await getRegimeAt(call.symbol, callDateMs);
  const regimeDifficulty = computeRegimeDifficulty(direction, regimeAtCall);

  // Update the call row
  await query(
    `UPDATE calls SET
      price_at_call = $1,
      price_7d = $2,
      price_30d = $3,
      price_90d = $4,
      btc_price_at_call = $5,
      btc_price_7d = $6,
      btc_price_30d = $7,
      btc_price_90d = $8,
      return_7d = $9,
      return_30d = $10,
      return_90d = $11,
      alpha_7d = $12,
      alpha_30d = $13,
      alpha_90d = $14,
      correct_direction = $15,
      hit_target = $16,
      regime_at_call = $17,
      regime_difficulty = $18
    WHERE id = $19`,
    [
      priceAtCall,
      price7d,
      price30d,
      price90d,
      btcPriceAtCall,
      btcPrice7d,
      btcPrice30d,
      btcPrice90d,
      return7d,
      return30d,
      return90d,
      alpha7d,
      alpha30d,
      alpha90d,
      correctDirection,
      hitTarget,
      regimeAtCall,
      regimeDifficulty,
      call.id,
    ],
  );

  return true;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting price matching...`);

  // Process in batches of 50
  const BATCH_SIZE = 50;
  let totalMatched = 0;
  let totalSkipped = 0;
  let offset = 0;

  while (true) {
    const batch = await query<UnmatchedCall>(
      `SELECT id, symbol, direction, target_price, call_date
       FROM calls
       WHERE price_at_call IS NULL
       ORDER BY call_date DESC
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset],
    );

    if (batch.length === 0) break;

    console.log(
      `[${timestamp()}] Processing batch: ${batch.length} calls (offset ${offset})`,
    );

    for (const call of batch) {
      try {
        const matched = await processCall(call);
        if (matched) {
          totalMatched++;
        } else {
          totalSkipped++;
        }
      } catch (error: unknown) {
        totalSkipped++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[${timestamp()}]   Error matching call ${call.id}: ${msg}`);
      }
    }

    console.log(
      `[${timestamp()}] Batch done: ${totalMatched} matched, ${totalSkipped} skipped so far`,
    );

    // If we got fewer than BATCH_SIZE, we're done
    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `[${timestamp()}] Price matching complete: ${totalMatched} matched, ${totalSkipped} skipped`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
