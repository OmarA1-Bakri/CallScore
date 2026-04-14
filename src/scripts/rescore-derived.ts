import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { didHitTarget } from "../lib/scoring";
import { query } from "../lib/db";
import { hasHorizonElapsed } from "../lib/public-methodology";
import type { Direction } from "../lib/types";

interface DerivedRow {
  readonly id: number;
  readonly symbol: string;
  readonly direction: string;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly call_date: string;
  readonly return_30d: number | null;
  readonly hit_target: boolean | null;
}

interface CandlePoint {
  readonly id: number;
  readonly max_high: number | null;
  readonly min_low: number | null;
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

export async function recomputeDerivedFields(
  callIds?: readonly number[],
): Promise<void> {
  const filters = callIds && callIds.length > 0
    ? "AND id = ANY($1::int[])"
    : "";
  const params = callIds && callIds.length > 0 ? [callIds] : [];

  const rows = await query<DerivedRow>(
    `SELECT id, symbol, direction, target_price, stop_loss,
            call_date::text AS call_date, return_30d, hit_target
     FROM calls
     WHERE price_at_call IS NOT NULL
       ${filters}
     ORDER BY symbol, call_date`,
    params,
  );

  if (rows.length === 0) return;

  await query(
    `UPDATE calls SET
      correct_direction = NULL,
      hit_target = NULL,
      score = 0
     WHERE price_at_call IS NOT NULL
       ${filters}`,
    params,
  );

  await query(
    `UPDATE calls SET
      correct_direction = CASE
        WHEN return_30d IS NULL THEN NULL
        WHEN direction = 'neutral' THEN ABS(return_30d) < 10
        WHEN direction = 'bullish' THEN return_30d > 2
        ELSE return_30d < -2
      END
     WHERE price_at_call IS NOT NULL
       AND call_date <= NOW() - INTERVAL '30 days'
       ${filters}`,
    params,
  );

  await query(
    `UPDATE calls SET hit_target = false
     WHERE price_at_call IS NOT NULL
       AND target_price IS NULL
       AND call_date <= NOW() - INTERVAL '90 days'
       ${filters}`,
    params,
  );

  const hitUpdates: { id: number; hit: boolean | null }[] = [];
  const eligibleTargetRows = rows.filter(
    (row) =>
      row.target_price !== null &&
      row.hit_target === null &&
      hasHorizonElapsed(row.call_date, "90d", new Date()),
  );
  if (eligibleTargetRows.length > 0) {
    console.log(`Recomputing hit_target for ${eligibleTargetRows.length} calls...`);
    const chunkSize = 10;
    for (let index = 0; index < eligibleTargetRows.length; index += chunkSize) {
      const chunkRows = eligibleTargetRows.slice(index, index + chunkSize);
      const chunkIds = chunkRows.map((row) => row.id);
      const candleRows = await query<CandlePoint>(
        `SELECT
          c.id,
          MAX(cd.high) AS max_high,
          MIN(cd.low) AS min_low
         FROM calls c
         LEFT JOIN candles cd
           ON cd.symbol = c.symbol
          AND cd.open_time >= EXTRACT(EPOCH FROM c.call_date) * 1000
          AND cd.open_time <= EXTRACT(EPOCH FROM c.call_date + INTERVAL '90 days') * 1000
         WHERE c.id = ANY($1::int[])
         GROUP BY c.id`,
        [chunkIds],
      );
      const candleMap = new Map(candleRows.map((row) => [row.id, row]));
      const chunkUpdates = chunkRows.map((row) => {
        const candle = candleMap.get(row.id);
        return {
          id: row.id,
          hit: didHitTarget(
            row.direction as Direction,
            row.target_price,
            row.stop_loss,
            candle?.max_high ?? null,
            candle?.min_low ?? null,
          ),
        };
      });
      hitUpdates.push(...chunkUpdates);
      await query(
        `UPDATE calls SET hit_target = bulk.hit
         FROM unnest($1::int[], $2::bool[]) AS bulk(id, hit)
         WHERE calls.id = bulk.id`,
        [chunkUpdates.map((row) => row.id), chunkUpdates.map((row) => row.hit)],
      );
      console.log(
        `  loaded target candle batch ${Math.floor(index / chunkSize) + 1}/${Math.ceil(eligibleTargetRows.length / chunkSize)}`,
      );
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  await recomputeDerivedFields();
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
