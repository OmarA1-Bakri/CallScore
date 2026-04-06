import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import {
  TRACKED_SYMBOLS,
  CONSENSUS_MIN_CREATORS,
  CONSENSUS_WINDOW_DAYS,
  MS_7D,
  MS_30D,
} from "../lib/constants";
import { computeReturn } from "../lib/scoring";

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

interface CallGroup {
  readonly id: number;
  readonly creator_id: number;
  readonly direction: string;
  readonly target_price: number | null;
  readonly call_date: string;
}

interface ExistingSignal {
  readonly id: number;
  readonly signal_date: string;
  readonly symbol: string;
  readonly direction: string;
  readonly creator_ids: readonly number[];
}

interface CandleRow {
  readonly close: number;
}

async function getPriceAt(symbol: string, dateMs: number): Promise<number | null> {
  const rows = await query<CandleRow>(
    "SELECT close FROM candles WHERE symbol = $1 AND open_time <= $2 ORDER BY open_time DESC LIMIT 1",
    [symbol, dateMs],
  );
  return rows.length > 0 ? rows[0].close : null;
}

/**
 * Detect new consensus signals: 3+ creators, same symbol, same direction, within 7-day window.
 */
async function detectNewSignals(): Promise<number> {
  let newSignals = 0;
  const windowMs = CONSENSUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (const symbol of TRACKED_SYMBOLS) {
    for (const direction of ["bullish", "bearish"] as const) {
      // Get all calls for this symbol+direction, ordered by date
      const calls = await query<CallGroup>(
        `SELECT id, creator_id, direction, target_price, call_date
         FROM calls
         WHERE symbol = $1
           AND direction = $2
           AND price_at_call IS NOT NULL
         ORDER BY call_date ASC`,
        [symbol, direction],
      );

      if (calls.length < CONSENSUS_MIN_CREATORS) continue;

      // Sliding window: group calls within 7-day windows
      let windowStart = 0;

      while (windowStart < calls.length) {
        const anchorDate = new Date(calls[windowStart].call_date).getTime();
        const windowEnd = anchorDate + windowMs;

        // Collect all calls within this window
        const windowCalls: CallGroup[] = [];
        for (let i = windowStart; i < calls.length; i++) {
          const callDateMs = new Date(calls[i].call_date).getTime();
          if (callDateMs <= windowEnd) {
            windowCalls.push(calls[i]);
          } else {
            break;
          }
        }

        // Deduplicate by creator_id (only count unique creators)
        const creatorMap = new Map<number, CallGroup>();
        for (const c of windowCalls) {
          if (!creatorMap.has(c.creator_id)) {
            creatorMap.set(c.creator_id, c);
          }
        }

        const uniqueCreators = Array.from(creatorMap.values());

        if (uniqueCreators.length >= CONSENSUS_MIN_CREATORS) {
          const creatorIds = uniqueCreators.map((c) => c.creator_id);
          const callIds = uniqueCreators.map((c) => c.id);
          const signalDateMs = anchorDate;
          const signalDate = new Date(signalDateMs).toISOString();

          // Check if this signal already exists (same symbol, direction, overlapping creators, similar date)
          const existing = await query<{ id: number }>(
            `SELECT id FROM consensus_signals
             WHERE symbol = $1
               AND direction = $2
               AND signal_date >= $3::timestamptz - INTERVAL '7 days'
               AND signal_date <= $3::timestamptz + INTERVAL '7 days'
             LIMIT 1`,
            [symbol, direction, signalDate],
          );

          if (existing.length === 0) {
            // Compute signal price
            const priceAtSignal = await getPriceAt(symbol, signalDateMs);

            // Compute average target price from contributing calls
            const targets = uniqueCreators
              .map((c) => c.target_price)
              .filter((t): t is number => t !== null);
            const avgTargetPrice = targets.length > 0
              ? targets.reduce((s, t) => s + t, 0) / targets.length
              : null;

            // Compute outcome prices
            const price7d = await getPriceAt(symbol, signalDateMs + MS_7D);
            const price30d = await getPriceAt(symbol, signalDateMs + MS_30D);

            const return7d =
              priceAtSignal !== null && price7d !== null
                ? computeReturn(priceAtSignal, price7d)
                : null;
            const return30d =
              priceAtSignal !== null && price30d !== null
                ? computeReturn(priceAtSignal, price30d)
                : null;

            // Determine if signal was correct
            let correct: boolean | null = null;
            if (return30d !== null) {
              if (direction === "bullish") {
                correct = return30d > 0;
              } else {
                correct = return30d < 0;
              }
            }

            await query(
              `INSERT INTO consensus_signals (
                symbol, direction, creator_count, creator_ids, call_ids,
                signal_date, avg_target_price, price_at_signal,
                price_7d, price_30d, return_7d, return_30d, correct
              ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11, $12, $13
              )`,
              [
                symbol,
                direction,
                uniqueCreators.length,
                creatorIds,
                callIds,
                signalDate,
                avgTargetPrice,
                priceAtSignal,
                price7d,
                price30d,
                return7d,
                return30d,
                correct,
              ],
            );

            newSignals++;
            console.log(
              `[${timestamp()}] New signal: ${symbol} ${direction} (${uniqueCreators.length} creators)`,
            );
          }

          // Skip past this window to avoid duplicates
          windowStart += uniqueCreators.length;
        } else {
          windowStart++;
        }
      }
    }
  }

  return newSignals;
}

/**
 * Update existing signals that are missing price outcome data.
 */
async function updateExistingSignals(): Promise<number> {
  const signals = await query<ExistingSignal>(
    `SELECT id, signal_date, symbol, direction, creator_ids
     FROM consensus_signals
     WHERE (price_7d IS NULL OR price_30d IS NULL)
       AND price_at_signal IS NOT NULL`,
  );

  let updated = 0;

  for (const signal of signals) {
    const signalDateMs = new Date(signal.signal_date).getTime();
    const priceAtSignal = await getPriceAt(signal.symbol, signalDateMs);
    if (priceAtSignal === null) continue;

    const price7d = await getPriceAt(signal.symbol, signalDateMs + MS_7D);
    const price30d = await getPriceAt(signal.symbol, signalDateMs + MS_30D);

    const return7d =
      price7d !== null ? computeReturn(priceAtSignal, price7d) : null;
    const return30d =
      price30d !== null ? computeReturn(priceAtSignal, price30d) : null;

    let correct: boolean | null = null;
    if (return30d !== null) {
      if (signal.direction === "bullish") {
        correct = return30d > 0;
      } else {
        correct = return30d < 0;
      }
    }

    const hasNewData = price7d !== null || price30d !== null;
    if (!hasNewData) continue;

    await query(
      `UPDATE consensus_signals SET
        price_7d = COALESCE($1, price_7d),
        price_30d = COALESCE($2, price_30d),
        return_7d = COALESCE($3, return_7d),
        return_30d = COALESCE($4, return_30d),
        correct = COALESCE($5, correct)
      WHERE id = $6`,
      [price7d, price30d, return7d, return30d, correct, signal.id],
    );

    updated++;
  }

  return updated;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Starting consensus detection...`);
  console.log(
    `[${timestamp()}] Parameters: min_creators=${CONSENSUS_MIN_CREATORS}, window=${CONSENSUS_WINDOW_DAYS}d`,
  );

  // Detect new consensus signals
  const newSignals = await detectNewSignals();
  console.log(`[${timestamp()}] Detected ${newSignals} new consensus signals`);

  // Update existing signals with price outcomes
  const updatedSignals = await updateExistingSignals();
  console.log(`[${timestamp()}] Updated ${updatedSignals} existing signals with new price data`);

  // Summary
  const totalSignals = await query<{ count: string }>(
    "SELECT COUNT(*)::text as count FROM consensus_signals",
  );
  const correctSignals = await query<{ count: string }>(
    "SELECT COUNT(*)::text as count FROM consensus_signals WHERE correct = true",
  );
  const total = parseInt(totalSignals[0]?.count ?? "0", 10);
  const correctCount = parseInt(correctSignals[0]?.count ?? "0", 10);
  const accuracy = total > 0 ? ((correctCount / total) * 100).toFixed(1) : "N/A";

  console.log(
    `[${timestamp()}] Total signals: ${total}, Correct: ${correctCount}, Accuracy: ${accuracy}%`,
  );
  console.log(`[${timestamp()}] Consensus detection complete`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
