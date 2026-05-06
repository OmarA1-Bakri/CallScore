import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";

function loadEnv(): void {
  if (process.env.NEON_DATABASE_URL) return;
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = t.slice(i + 1).trim();
  }
}

async function main(): Promise<void> {
  loadEnv();

  // Distribution of return_30d
  const dist = await query<{
    min: string;
    max: string;
    avg: string;
    p25: string;
    p50: string;
    p75: string;
    below_neg1: string;
    above_10: string;
  }>(
    `SELECT
      MIN(return_30d)::text as min,
      MAX(return_30d)::text as max,
      AVG(return_30d)::text as avg,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY return_30d)::text as p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY return_30d)::text as p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY return_30d)::text as p75,
      COUNT(*) FILTER (WHERE return_30d < -1)::text as below_neg1,
      COUNT(*) FILTER (WHERE return_30d > 10)::text as above_10
    FROM calls
    WHERE return_30d IS NOT NULL`,
  );
  console.log("Return_30d distribution:");
  console.log(dist[0]);

  // Sample extreme values
  const extreme = await query<{
    id: number;
    symbol: string;
    direction: string;
    price_at_call: number;
    price_30d: number;
    return_30d: number;
    call_date: string;
  }>(
    `SELECT id, symbol, direction, price_at_call::float8 as price_at_call, price_30d::float8 as price_30d,
            return_30d::float8 as return_30d, call_date::text as call_date
     FROM calls
     WHERE return_30d IS NOT NULL
     ORDER BY return_30d ASC
     LIMIT 10`,
  );
  console.log("\n10 most negative returns:");
  for (const e of extreme) {
    console.log(
      `  id=${e.id} ${e.symbol} ${e.direction} @${e.price_at_call} → ${e.price_30d} = ${e.return_30d.toFixed(1)}%  ${e.call_date.substring(0, 10)}`,
    );
  }

  const top = await query<{
    id: number;
    symbol: string;
    direction: string;
    price_at_call: number;
    price_30d: number;
    return_30d: number;
    call_date: string;
  }>(
    `SELECT id, symbol, direction, price_at_call::float8 as price_at_call, price_30d::float8 as price_30d,
            return_30d::float8 as return_30d, call_date::text as call_date
     FROM calls
     WHERE return_30d IS NOT NULL
     ORDER BY return_30d DESC
     LIMIT 10`,
  );
  console.log("\n10 most positive returns:");
  for (const e of top) {
    console.log(
      `  id=${e.id} ${e.symbol} ${e.direction} @${e.price_at_call} → ${e.price_30d} = ${e.return_30d.toFixed(1)}%  ${e.call_date.substring(0, 10)}`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
