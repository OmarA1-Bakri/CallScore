/**
 * rescore-derived.ts
 *
 * Recomputes derived scoring fields for all matched calls using the
 * updated rubric logic:
 *   - correct_direction: now requires >2% magnitude (bullish/bearish)
 *   - hit_target: now conservative — assumes stop hit first if both triggered
 *   - score: reset to 0 so compute-scores will rescore with new formula
 *
 * Run this BEFORE compute-scores.ts after rubric changes.
 */
import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { MS_90D } from "../lib/constants";
import { isDirectionCorrect, didHitTarget } from "../lib/scoring";
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

interface MatchedCall {
  readonly id: number;
  readonly symbol: string;
  readonly direction: string;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly call_date: string;
  readonly return_30d: number | null;
  readonly correct_direction: boolean | null;
  readonly hit_target: boolean | null;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting derived field recomputation...`);

  // Fetch all matched calls
  const calls = await query<MatchedCall>(
    `SELECT id, symbol, direction, target_price, stop_loss, call_date,
            return_30d, correct_direction, hit_target
     FROM calls
     WHERE price_at_call IS NOT NULL`,
  );

  console.log(`[${timestamp()}] Processing ${calls.length} matched calls...`);

  let directionChanged = 0;
  let targetChanged = 0;
  let processed = 0;

  for (const call of calls) {
    const direction = call.direction as Direction;

    // Recompute correct_direction with magnitude floor
    const newCorrectDirection =
      call.return_30d !== null
        ? isDirectionCorrect(direction, call.return_30d)
        : null;

    // Recompute hit_target with stop-loss guard
    // Need to re-query high/low between call_date and +90d
    const callDateMs = new Date(call.call_date).getTime();
    const rows = await query<{ max_high: number | null; min_low: number | null }>(
      `SELECT MAX(high) as max_high, MIN(low) as min_low
       FROM candles
       WHERE symbol = $1 AND open_time >= $2 AND open_time <= $3`,
      [call.symbol, callDateMs, callDateMs + MS_90D],
    );

    const maxHigh = rows.length > 0 ? rows[0].max_high : null;
    const minLow = rows.length > 0 ? rows[0].min_low : null;
    const newHitTarget = didHitTarget(
      direction,
      call.target_price,
      call.stop_loss,
      maxHigh,
      minLow,
    );

    const dirChanged = newCorrectDirection !== call.correct_direction;
    const tgtChanged = newHitTarget !== call.hit_target;

    if (dirChanged) directionChanged++;
    if (tgtChanged) targetChanged++;

    // Update the call: rewrite derived fields + reset score to 0
    await query(
      `UPDATE calls SET
        correct_direction = $1,
        hit_target = $2,
        score = 0
      WHERE id = $3`,
      [newCorrectDirection, newHitTarget, call.id],
    );

    processed++;
    if (processed % 500 === 0) {
      console.log(
        `[${timestamp()}] ${processed}/${calls.length} — direction changed: ${directionChanged}, target changed: ${targetChanged}`,
      );
    }
  }

  console.log(`[${timestamp()}] Rescore complete:`);
  console.log(`  Total processed: ${processed}`);
  console.log(`  Direction correctness changed: ${directionChanged}`);
  console.log(`  Hit-target changed: ${targetChanged}`);
  console.log(`  All scores reset to 0 — run compute-scores.ts next`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
