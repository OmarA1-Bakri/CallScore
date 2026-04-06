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

async function main(): Promise<void> {
  loadEnv();

  const tables = ["creators", "videos", "calls", "candles", "creator_stats", "consensus_signals"];
  for (const table of tables) {
    try {
      const rows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`${table}: ${rows[0].count} rows`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${table}: ERROR - ${msg.slice(0, 100)}`);
    }
  }

  // Check candle date range
  try {
    const range = await query<{ min_date: string; max_date: string }>(
      "SELECT MIN(open_time) as min_date, MAX(open_time) as max_date FROM candles"
    );
    if (range[0].min_date) {
      console.log(`\nCandle range: ${new Date(Number(range[0].min_date)).toISOString()} to ${new Date(Number(range[0].max_date)).toISOString()}`);
    } else {
      console.log("\nCandles table is EMPTY - need to load price data");
    }
  } catch {
    console.log("\nCould not check candle range");
  }

  // Check calls with vs without prices
  try {
    const matched = await query<{ count: string }>("SELECT COUNT(*) as count FROM calls WHERE price_at_call IS NOT NULL");
    const unmatched = await query<{ count: string }>("SELECT COUNT(*) as count FROM calls WHERE price_at_call IS NULL");
    console.log(`\nCalls with prices: ${matched[0].count}`);
    console.log(`Calls without prices: ${unmatched[0].count}`);
  } catch {
    console.log("\nCould not check call prices");
  }

  // Check calls per creator
  try {
    const perCreator = await query<{ name: string; call_count: string }>(
      `SELECT c.name, COUNT(cl.id) as call_count
       FROM creators c
       LEFT JOIN calls cl ON cl.creator_id = c.id
       GROUP BY c.id, c.name
       ORDER BY call_count DESC`
    );
    console.log("\nCalls per creator:");
    for (const row of perCreator) {
      console.log(`  ${row.name}: ${row.call_count}`);
    }
  } catch {
    console.log("\nCould not check per-creator counts");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
