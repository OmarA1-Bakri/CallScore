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

  // 1. Call date distribution
  const dates = await query<{
    earliest: string;
    latest: string;
    nonzero_ret: string;
    null_ret: string;
    zero_ret: string;
  }>(
    `SELECT
      MIN(call_date)::text as earliest,
      MAX(call_date)::text as latest,
      COUNT(*) FILTER (WHERE return_30d IS NOT NULL AND return_30d != 0)::text as nonzero_ret,
      COUNT(*) FILTER (WHERE return_30d IS NULL)::text as null_ret,
      COUNT(*) FILTER (WHERE return_30d = 0)::text as zero_ret
    FROM calls`,
  );
  console.log("=== CALL DATES ===");
  console.log(JSON.stringify(dates[0], null, 2));

  // 2. Video date range
  const vids = await query<{ earliest: string; latest: string; total: string }>(
    `SELECT MIN(published_at)::text as earliest, MAX(published_at)::text as latest, COUNT(*)::text as total FROM videos`,
  );
  console.log("\n=== VIDEO DATES ===");
  console.log(JSON.stringify(vids[0], null, 2));

  // 3. Sample: call_date vs video published_at
  const samples = await query<{
    call_date: string;
    video_date: string;
    symbol: string;
    return_30d: number | null;
    price_at_call: number | null;
    price_30d: number | null;
  }>(
    `SELECT cl.call_date::text, v.published_at::text as video_date, cl.symbol, cl.return_30d, cl.price_at_call, cl.price_30d
     FROM calls cl JOIN videos v ON v.id = cl.video_id LIMIT 5`,
  );
  console.log("\n=== SAMPLE CALLS vs VIDEO DATES ===");
  for (const s of samples) {
    console.log(`call_date=${s.call_date} | video_date=${s.video_date} | ${s.symbol} ret=${s.return_30d} price@call=${s.price_at_call} price30d=${s.price_30d}`);
  }

  // 4. Candle date range
  const candles = await query<{ earliest: string; latest: string; total: string }>(
    `SELECT MIN(open_time)::text as earliest, MAX(open_time)::text as latest, COUNT(*)::text as total FROM candles LIMIT 1`,
  );
  console.log("\n=== CANDLE DATA RANGE ===");
  console.log(JSON.stringify(candles[0], null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
