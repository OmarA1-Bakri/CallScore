/**
 * rescore-derived.ts
 *
 * Recomputes derived scoring fields for all matched calls using the
 * updated rubric logic:
 *   - correct_direction: now requires >2% magnitude (bullish/bearish)
 *   - hit_target: conservative — assumes stop hit first if both triggered
 *   - score: reset to 0 so compute-scores will rescore with new formula
 *
 * OPTIMIZED: Uses batch SQL instead of per-call candle queries.
 * Previous version: 4224 individual queries against 18.7M-row candles table.
 * New version: 2 batch queries (correct_direction has no candle dependency).
 *
 * Run this BEFORE compute-scores.ts after rubric changes.
 */
import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { MS_90D } from "../lib/constants";
import { didHitTarget } from "../lib/scoring";
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

interface TargetCall {
  readonly id: number;
  readonly symbol: string;
  readonly direction: string;
  readonly target_price: number;
  readonly stop_loss: number | null;
  readonly call_date: string;
}

interface CandlePoint {
  readonly open_time: string;
  readonly high: number;
  readonly low: number;
}

/**
 * Binary search: find the leftmost index where candles[i].open_time >= target.
 */
function lowerBound(candles: readonly CandlePoint[], targetMs: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (Number(candles[mid].open_time) < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting derived field recomputation (batch mode)...`);

  // Count matched calls
  const countResult = await query<{ count: string }>(
    "SELECT COUNT(*)::text as count FROM calls WHERE price_at_call IS NOT NULL",
  );
  const totalCalls = parseInt(countResult[0]?.count ?? "0", 10);
  console.log(`[${timestamp()}] Total matched calls: ${totalCalls}`);

  // ── Step 1: Batch correct_direction (no candle lookups needed) ────────
  // This replaces 4224 individual evaluations with one SQL statement.
  // The magnitude floor (>2% for bullish/bearish) is embedded in the CASE.
  console.log(`[${timestamp()}] Step 1: Batch-updating correct_direction...`);
  await query(
    `UPDATE calls SET
      correct_direction = CASE
        WHEN return_30d IS NULL THEN NULL
        WHEN direction = 'neutral' THEN ABS(return_30d) < 10
        WHEN direction = 'bullish' THEN return_30d > 2
        ELSE return_30d < -2
      END
    WHERE price_at_call IS NOT NULL`,
  );
  console.log(`[${timestamp()}] Step 1 complete: correct_direction updated for all matched calls`);

  // ── Step 2: Batch hit_target per symbol ────────
  // Only calls with target_price need candle data. Group by symbol to
  // minimize candle table scans (one scan per symbol instead of per call).
  const callsWithTarget = await query<TargetCall>(
    `SELECT id, symbol, direction, target_price, stop_loss, call_date
     FROM calls
     WHERE price_at_call IS NOT NULL AND target_price IS NOT NULL
     ORDER BY symbol, call_date`,
  );

  console.log(
    `[${timestamp()}] Step 2: Computing hit_target for ${callsWithTarget.length} calls with targets...`,
  );

  // Set hit_target = false for calls without target_price (bulk)
  await query(
    `UPDATE calls SET hit_target = false
     WHERE price_at_call IS NOT NULL AND target_price IS NULL`,
  );

  if (callsWithTarget.length > 0) {
    // Group calls by symbol
    const bySymbol = new Map<string, TargetCall[]>();
    for (const c of callsWithTarget) {
      const group = bySymbol.get(c.symbol) ?? [];
      group.push(c);
      bySymbol.set(c.symbol, group);
    }

    const hitUpdates: { id: number; hit: boolean }[] = [];
    let symbolsProcessed = 0;

    for (const [symbol, symbolCalls] of Array.from(bySymbol.entries())) {
      // Find the overall date range needed for this symbol
      const dateMs = symbolCalls.map((c) => new Date(c.call_date).getTime());
      const minDate = Math.min(...dateMs);
      const maxDate = Math.max(...dateMs) + MS_90D;

      // One query per symbol: fetch all candles in the needed range
      const candles = await query<CandlePoint>(
        `SELECT open_time::text as open_time, high, low
         FROM candles
         WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3
         ORDER BY open_time ASC`,
        [symbol, minDate, maxDate],
      );

      // For each call, binary search for the relevant window and compute max/min
      for (const call of symbolCalls) {
        const callMs = new Date(call.call_date).getTime();
        const endMs = callMs + MS_90D;

        const startIdx = lowerBound(candles, callMs);
        let maxHigh = -Infinity;
        let minLow = Infinity;

        for (let i = startIdx; i < candles.length; i++) {
          const t = Number(candles[i].open_time);
          if (t > endMs) break;
          if (candles[i].high > maxHigh) maxHigh = candles[i].high;
          if (candles[i].low < minLow) minLow = candles[i].low;
        }

        const hit = didHitTarget(
          call.direction as Direction,
          call.target_price,
          call.stop_loss,
          maxHigh === -Infinity ? null : maxHigh,
          minLow === Infinity ? null : minLow,
        );

        hitUpdates.push({ id: call.id, hit });
      }

      symbolsProcessed++;
      if (symbolsProcessed % 10 === 0 || symbolsProcessed === bySymbol.size) {
        console.log(
          `[${timestamp()}]   ${symbolsProcessed}/${bySymbol.size} symbols processed`,
        );
      }
    }

    // Batch UPDATE hit_target using unnest
    const BATCH_SIZE = 500;
    for (let i = 0; i < hitUpdates.length; i += BATCH_SIZE) {
      const batch = hitUpdates.slice(i, i + BATCH_SIZE);
      await query(
        `UPDATE calls SET hit_target = bulk.hit
         FROM unnest($1::int[], $2::bool[]) AS bulk(id, hit)
         WHERE calls.id = bulk.id`,
        [batch.map((u) => u.id), batch.map((u) => u.hit)],
      );
    }

    const hitCount = hitUpdates.filter((u) => u.hit).length;
    console.log(
      `[${timestamp()}] Step 2 complete: ${hitUpdates.length} target calls evaluated, ${hitCount} hit target`,
    );
  }

  // ── Step 3: Reset all scores to 0 ────────
  await query(
    `UPDATE calls SET score = 0 WHERE price_at_call IS NOT NULL`,
  );

  console.log(`[${timestamp()}] All scores reset to 0 — run compute-scores.ts next`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
