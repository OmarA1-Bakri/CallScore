import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { createLogger } from "../lib/logger";
import { MATCH_PRICES_ADVISORY_LOCK_ID, withMatchPricesAdvisoryLock } from "./match-prices";

const logger = createLogger({ component: "match-prices-set-based" });

export interface SetBasedMatchArgs {
  readonly limit: number;
  readonly startAfterId: number;
  readonly rematchAll: boolean;
}

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
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

export function parseSetBasedMatchArgs(argv = process.argv.slice(2)): SetBasedMatchArgs {
  return {
    limit: positiveInt(argValue(argv, "--limit"), 1000),
    startAfterId: nonNegativeInt(argValue(argv, "--start-after-id"), 0),
    rematchAll: argv.includes("--all") || argv.includes("--full") || argv.includes("--recompute"),
  };
}

export function buildSetBasedMatchSql(rematchAll: boolean): string {
  const predicate = rematchAll
    ? "c.id > $1"
    : `c.id > $1 AND (
        c.price_at_call IS NULL
        OR c.btc_price_at_call IS NULL
        OR (c.call_date <= NOW() - INTERVAL '7 days' AND (c.price_7d IS NULL OR c.btc_price_7d IS NULL OR c.return_7d IS NULL))
        OR (c.call_date <= NOW() - INTERVAL '30 days' AND (c.price_30d IS NULL OR c.btc_price_30d IS NULL OR c.return_30d IS NULL))
        OR (c.call_date <= NOW() - INTERVAL '90 days' AND (c.price_90d IS NULL OR c.btc_price_90d IS NULL OR c.return_90d IS NULL))
        OR (c.target_price IS NOT NULL AND c.call_date <= NOW() - INTERVAL '90 days' AND c.hit_target IS NULL)
      )`;

  return `WITH candidates AS (
    SELECT c.*
    FROM calls c
    WHERE ${predicate}
    ORDER BY c.id ASC
    LIMIT $2
  ), priced AS (
    SELECT
      c.id,
      c.direction,
      c.target_price,
      c.stop_loss,
      coin_call.close AS price_at_call,
      coin_call.regime AS regime_at_call,
      coin_7d.close AS price_7d,
      coin_30d.close AS price_30d,
      coin_90d.close AS price_90d,
      btc_call.close AS btc_price_at_call,
      btc_7d.close AS btc_price_7d,
      btc_30d.close AS btc_price_30d,
      btc_90d.close AS btc_price_90d,
      high_low.max_high,
      high_low.min_low
    FROM candidates c
    LEFT JOIN LATERAL (
      SELECT close, regime FROM candles
      WHERE symbol = c.symbol
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) coin_call ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = c.symbol AND c.call_date <= NOW() - INTERVAL '7 days'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 604800000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 + 604800000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) coin_7d ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = c.symbol AND c.call_date <= NOW() - INTERVAL '30 days'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 2592000000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 + 2592000000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) coin_30d ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = c.symbol AND c.call_date <= NOW() - INTERVAL '90 days'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 7776000000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 + 7776000000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) coin_90d ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = 'BTCUSDT'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) btc_call ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = 'BTCUSDT' AND c.call_date <= NOW() - INTERVAL '7 days'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 604800000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 + 604800000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) btc_7d ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = 'BTCUSDT' AND c.call_date <= NOW() - INTERVAL '30 days'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 2592000000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 + 2592000000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) btc_30d ON true
    LEFT JOIN LATERAL (
      SELECT close FROM candles
      WHERE symbol = 'BTCUSDT' AND c.call_date <= NOW() - INTERVAL '90 days'
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 7776000000
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000 + 7776000000 - 86400000
      ORDER BY open_time DESC LIMIT 1
    ) btc_90d ON true
    LEFT JOIN LATERAL (
      SELECT MAX(high) AS max_high, MIN(low) AS min_low
      FROM candles
      WHERE symbol = c.symbol
        AND c.call_date <= NOW() - INTERVAL '90 days'
        AND open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000
        AND open_time <= EXTRACT(EPOCH FROM c.call_date) * 1000 + 7776000000
    ) high_low ON true
  ), computed AS (
    SELECT *,
      CASE WHEN price_at_call IS NOT NULL AND price_at_call <> 0 AND price_7d IS NOT NULL THEN ((price_7d - price_at_call) / price_at_call) * 100 END AS return_7d,
      CASE WHEN price_at_call IS NOT NULL AND price_at_call <> 0 AND price_30d IS NOT NULL THEN ((price_30d - price_at_call) / price_at_call) * 100 END AS return_30d,
      CASE WHEN price_at_call IS NOT NULL AND price_at_call <> 0 AND price_90d IS NOT NULL THEN ((price_90d - price_at_call) / price_at_call) * 100 END AS return_90d,
      CASE WHEN btc_price_at_call IS NOT NULL AND btc_price_at_call <> 0 AND btc_price_7d IS NOT NULL THEN ((btc_price_7d - btc_price_at_call) / btc_price_at_call) * 100 END AS btc_return_7d,
      CASE WHEN btc_price_at_call IS NOT NULL AND btc_price_at_call <> 0 AND btc_price_30d IS NOT NULL THEN ((btc_price_30d - btc_price_at_call) / btc_price_at_call) * 100 END AS btc_return_30d,
      CASE WHEN btc_price_at_call IS NOT NULL AND btc_price_at_call <> 0 AND btc_price_90d IS NOT NULL THEN ((btc_price_90d - btc_price_at_call) / btc_price_at_call) * 100 END AS btc_return_90d
    FROM priced
    WHERE price_at_call IS NOT NULL
  )
  UPDATE calls c
  SET
    price_at_call = computed.price_at_call,
    price_7d = computed.price_7d,
    price_30d = computed.price_30d,
    price_90d = computed.price_90d,
    btc_price_at_call = computed.btc_price_at_call,
    btc_price_7d = computed.btc_price_7d,
    btc_price_30d = computed.btc_price_30d,
    btc_price_90d = computed.btc_price_90d,
    return_7d = computed.return_7d,
    return_30d = computed.return_30d,
    return_90d = computed.return_90d,
    alpha_7d = CASE WHEN computed.return_7d IS NOT NULL AND computed.btc_return_7d IS NOT NULL THEN computed.return_7d - computed.btc_return_7d END,
    alpha_30d = CASE WHEN computed.return_30d IS NOT NULL AND computed.btc_return_30d IS NOT NULL THEN computed.return_30d - computed.btc_return_30d END,
    alpha_90d = CASE WHEN computed.return_90d IS NOT NULL AND computed.btc_return_90d IS NOT NULL THEN computed.return_90d - computed.btc_return_90d END,
    correct_direction = CASE
      WHEN computed.return_30d IS NULL THEN NULL
      WHEN computed.direction = 'neutral' THEN ABS(computed.return_30d) < 10
      WHEN computed.direction = 'bullish' THEN computed.return_30d > 2
      ELSE computed.return_30d < -2
    END,
    hit_target = CASE
      WHEN computed.target_price IS NULL THEN false
      WHEN computed.direction = 'bullish' AND computed.max_high IS NOT NULL THEN computed.max_high >= computed.target_price AND NOT (computed.stop_loss IS NOT NULL AND computed.min_low <= computed.stop_loss)
      WHEN computed.direction = 'bearish' AND computed.min_low IS NOT NULL THEN computed.min_low <= computed.target_price AND NOT (computed.stop_loss IS NOT NULL AND computed.max_high >= computed.stop_loss)
      ELSE false
    END,
    regime_at_call = computed.regime_at_call,
    regime_difficulty = CASE
      WHEN computed.regime_at_call IS NULL THEN 0.5
      WHEN computed.direction = 'bearish' THEN (ARRAY[1.0,0.9,0.7,0.5,0.3,0.2,0.1])[computed.regime_at_call + 1]
      ELSE (ARRAY[0.1,0.2,0.3,0.5,0.7,0.9,1.0])[computed.regime_at_call + 1]
    END
  FROM computed
  WHERE c.id = computed.id
  RETURNING c.id`;
}

export async function runSetBasedMatchPrices(args: SetBasedMatchArgs): Promise<Record<string, number | boolean>> {
  const lockResult = await withMatchPricesAdvisoryLock(async () => {
    const rows = await query<{ id: number }>(buildSetBasedMatchSql(args.rematchAll), [
      args.startAfterId,
      args.limit,
    ]);
    return rows.length;
  });
  if (!lockResult.locked) {
    logger.warn("price_matching_lock_busy", { advisory_lock_id: MATCH_PRICES_ADVISORY_LOCK_ID });
    return { locked: false, matched: 0 };
  }
  return { locked: true, matched: lockResult.result };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const args = parseSetBasedMatchArgs(argv);
  const metrics = await runSetBasedMatchPrices(args);
  logger.info("set_based_price_matching_complete", metrics);
}

if (require.main === module) {
  main().catch((error) => {
    logger.error("fatal_error", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exit(1);
  });
}
