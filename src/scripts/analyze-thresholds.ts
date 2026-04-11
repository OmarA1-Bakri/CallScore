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
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main(): Promise<void> {
  loadEnv();

  // Bullish calls: return distribution
  const bullish = await query<{
    barely_positive: string; clearly_positive: string;
    barely_negative: string; clearly_negative: string;
    total: string; avg_return: number; median_return: number;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE return_30d > 0 AND return_30d <= 2)::text as barely_positive,
      COUNT(*) FILTER (WHERE return_30d > 2)::text as clearly_positive,
      COUNT(*) FILTER (WHERE return_30d < 0 AND return_30d >= -2)::text as barely_negative,
      COUNT(*) FILTER (WHERE return_30d < -2)::text as clearly_negative,
      COUNT(*)::text as total,
      AVG(return_30d) as avg_return,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY return_30d) as median_return
    FROM calls
    WHERE direction = 'bullish' AND return_30d IS NOT NULL AND price_at_call IS NOT NULL`,
  );
  console.log("Bullish calls return distribution:", JSON.stringify(bullish[0], null, 2));

  // Win rates at different thresholds
  const thresholds = await query<{
    win_0: string; win_1: string; win_2: string; win_3: string; win_5: string; total: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE return_30d > 0)::text as win_0,
      COUNT(*) FILTER (WHERE return_30d > 1)::text as win_1,
      COUNT(*) FILTER (WHERE return_30d > 2)::text as win_2,
      COUNT(*) FILTER (WHERE return_30d > 3)::text as win_3,
      COUNT(*) FILTER (WHERE return_30d > 5)::text as win_5,
      COUNT(*)::text as total
    FROM calls WHERE direction = 'bullish' AND return_30d IS NOT NULL AND price_at_call IS NOT NULL`,
  );
  const t = thresholds[0];
  const total = parseInt(t.total, 10);
  console.log("\nBullish win rates at thresholds:");
  console.log(`  >0%: ${((parseInt(t.win_0, 10) / total) * 100).toFixed(1)}% (${t.win_0}/${t.total})`);
  console.log(`  >1%: ${((parseInt(t.win_1, 10) / total) * 100).toFixed(1)}% (${t.win_1}/${t.total})`);
  console.log(`  >2%: ${((parseInt(t.win_2, 10) / total) * 100).toFixed(1)}% (${t.win_2}/${t.total})`);
  console.log(`  >3%: ${((parseInt(t.win_3, 10) / total) * 100).toFixed(1)}% (${t.win_3}/${t.total})`);
  console.log(`  >5%: ${((parseInt(t.win_5, 10) / total) * 100).toFixed(1)}% (${t.win_5}/${t.total})`);

  // Bearish win rates
  const bearish = await query<{
    win_0: string; win_2: string; total: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE return_30d < 0)::text as win_0,
      COUNT(*) FILTER (WHERE return_30d < -2)::text as win_2,
      COUNT(*)::text as total
    FROM calls WHERE direction = 'bearish' AND return_30d IS NOT NULL AND price_at_call IS NOT NULL`,
  );
  const bt = bearish[0];
  const btotal = parseInt(bt.total, 10);
  console.log("\nBearish win rates:");
  console.log(`  <0%: ${((parseInt(bt.win_0, 10) / btotal) * 100).toFixed(1)}% (${bt.win_0}/${bt.total})`);
  console.log(`  <-2%: ${((parseInt(bt.win_2, 10) / btotal) * 100).toFixed(1)}% (${bt.win_2}/${bt.total})`);

  // High confidence analysis
  const conf = await query<{
    confidence: string; total: string; avg_score: number; win_count: string;
  }>(
    `SELECT COALESCE(confidence, 'null') as confidence,
            COUNT(*)::text as total,
            AVG(score) as avg_score,
            COUNT(*) FILTER (WHERE correct_direction = true)::text as win_count
     FROM calls
     WHERE price_at_call IS NOT NULL AND return_30d IS NOT NULL AND extraction_confidence >= 0.5
     GROUP BY confidence ORDER BY avg_score DESC`,
  );
  console.log("\nConfidence analysis:");
  for (const c of conf) {
    const wins = parseInt(c.win_count, 10);
    const t = parseInt(c.total, 10);
    console.log(`  ${c.confidence}: ${c.total} calls, avg score ${c.avg_score?.toFixed(2)}, win rate ${((wins / t) * 100).toFixed(1)}%`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
