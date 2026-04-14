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
import { hasHorizonElapsed } from "../lib/public-methodology";
import type { Direction } from "../lib/types";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

// ── In-memory price cache ─────────────────────────────────────────
// Key: `${symbol}:${roundedMs}` → { close, regime }
// Rounds timestamps to 5-min intervals to maximize cache hits.
const ROUND_MS = 5 * 60 * 1000; // 5 min
const priceCache = new Map<string, { close: number; regime: number | null } | null>();

function roundTime(ms: number): number {
  return Math.floor(ms / ROUND_MS) * ROUND_MS;
}

function cacheKey(symbol: string, ms: number): string {
  return `${symbol}:${roundTime(ms)}`;
}

interface CandleResult {
  readonly close: number;
  readonly regime: number | null;
}

// Max staleness: reject candles more than 24h before the target timestamp.
// Without this, a data gap could silently use a days-old price.
const MAX_STALENESS_MS = 24 * 60 * 60 * 1000;

async function getCandleAt(symbol: string, dateMs: number): Promise<CandleResult | null> {
  const key = cacheKey(symbol, dateMs);
  if (priceCache.has(key)) {
    return priceCache.get(key) ?? null;
  }

  const rows = await query<{ close: number; regime: number | null; open_time: string }>(
    "SELECT close, regime, open_time FROM candles WHERE symbol = $1 AND open_time <= $2 ORDER BY open_time DESC LIMIT 1",
    [symbol, dateMs],
  );

  if (rows.length === 0) {
    priceCache.set(key, null);
    return null;
  }

  const candleTime = typeof rows[0].open_time === "string"
    ? parseInt(rows[0].open_time, 10)
    : Number(rows[0].open_time);
  const staleness = dateMs - candleTime;

  if (staleness > MAX_STALENESS_MS) {
    // Candle is too old — data gap, don't trust this price
    priceCache.set(key, null);
    return null;
  }

  const result: CandleResult = { close: rows[0].close, regime: rows[0].regime };
  priceCache.set(key, result);
  return result;
}

// ── High/Low cache ────────────────────────────────────────────────
const highLowCache = new Map<string, { maxHigh: number | null; minLow: number | null }>();

async function getHighLowBetween(
  symbol: string,
  fromMs: number,
  toMs: number,
): Promise<{ maxHigh: number | null; minLow: number | null }> {
  const key = `${symbol}:${roundTime(fromMs)}:${roundTime(toMs)}`;
  if (highLowCache.has(key)) {
    return highLowCache.get(key)!;
  }

  const rows = await query<{ max_high: number | null; min_low: number | null }>(
    "SELECT MAX(high) as max_high, MIN(low) as min_low FROM candles WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3",
    [symbol, fromMs, toMs],
  );

  const result = rows.length === 0
    ? { maxHigh: null, minLow: null }
    : { maxHigh: rows[0].max_high, minLow: rows[0].min_low };

  highLowCache.set(key, result);
  return result;
}

// ── Process a single call ─────────────────────────────────────────
interface UnmatchedCall {
  readonly id: number;
  readonly symbol: string;
  readonly direction: string;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly call_date: string;
}

async function processCall(call: UnmatchedCall): Promise<boolean> {
  const callDateMs = new Date(call.call_date).getTime();
  if (isNaN(callDateMs)) return false;
  const now = new Date();

  const has7d = hasHorizonElapsed(call.call_date, "7d", now);
  const has30d = hasHorizonElapsed(call.call_date, "30d", now);
  const has90d = hasHorizonElapsed(call.call_date, "90d", now);

  // Fetch all needed prices (coin + BTC at 4 timestamps each) using cache
  const [coinNow, coin7d, coin30d, coin90d, btcNow, btc7d, btc30d, btc90d] = await Promise.all([
    getCandleAt(call.symbol, callDateMs),
    has7d ? getCandleAt(call.symbol, callDateMs + MS_7D) : Promise.resolve(null),
    has30d ? getCandleAt(call.symbol, callDateMs + MS_30D) : Promise.resolve(null),
    has90d ? getCandleAt(call.symbol, callDateMs + MS_90D) : Promise.resolve(null),
    getCandleAt("BTCUSDT", callDateMs),
    has7d ? getCandleAt("BTCUSDT", callDateMs + MS_7D) : Promise.resolve(null),
    has30d ? getCandleAt("BTCUSDT", callDateMs + MS_30D) : Promise.resolve(null),
    has90d ? getCandleAt("BTCUSDT", callDateMs + MS_90D) : Promise.resolve(null),
  ]);

  if (!coinNow) return false; // No candle data for this symbol

  const priceAtCall = coinNow.close;
  const price7d = coin7d?.close ?? null;
  const price30d = coin30d?.close ?? null;
  const price90d = coin90d?.close ?? null;
  const btcPriceAtCall = btcNow?.close ?? null;
  const btcPrice7d = btc7d?.close ?? null;
  const btcPrice30d = btc30d?.close ?? null;
  const btcPrice90d = btc90d?.close ?? null;

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
  let hitTarget: boolean | null = null;
  if (has90d) {
    const { maxHigh, minLow } = await getHighLowBetween(
      call.symbol,
      callDateMs,
      callDateMs + MS_90D,
    );
    hitTarget = didHitTarget(direction, call.target_price, call.stop_loss, maxHigh, minLow);
  }

  // Regime at call time
  const regimeAtCall = coinNow.regime;
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

// ── Main ──────────────────────────────────────────────────────────
async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting price matching (with cache)...`);

  const BATCH_SIZE = 200;
  let totalMatched = 0;
  let totalSkipped = 0;
  let lastId = 0;

  while (true) {
    // Use cursor-based pagination (faster than OFFSET for large datasets)
    const batch = await query<UnmatchedCall>(
      `SELECT id, symbol, direction, target_price, stop_loss, call_date
       FROM calls
       WHERE price_at_call IS NULL AND id > $1
       ORDER BY id ASC
       LIMIT $2`,
      [lastId, BATCH_SIZE],
    );

    if (batch.length === 0) break;

    console.log(
      `[${timestamp()}] Processing batch of ${batch.length} (from id ${batch[0].id}, cache size: ${priceCache.size})`,
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
      lastId = call.id;
    }

    console.log(
      `[${timestamp()}] Batch done: ${totalMatched} matched, ${totalSkipped} skipped (total)`,
    );
  }

  console.log(
    `[${timestamp()}] Price matching complete: ${totalMatched} matched, ${totalSkipped} skipped`,
  );
  console.log(`[${timestamp()}] Cache stats: ${priceCache.size} price entries, ${highLowCache.size} high/low entries`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
