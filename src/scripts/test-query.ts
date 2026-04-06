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

  // Test the exact query from page.tsx
  try {
    const rows = await query(
      `SELECT
        cs.*,
        c.name,
        c.youtube_handle,
        c.youtube_channel_id,
        c.subscribers,
        c.focus,
        c.tier,
        c.alpha_score AS creator_alpha_score,
        c.total_calls AS creator_total_calls,
        c.win_rate AS creator_win_rate,
        c.avg_return AS creator_avg_return,
        c.accuracy_rank AS creator_accuracy_rank,
        c.last_scraped_at AS creator_last_scraped_at,
        c.created_at AS creator_created_at,
        bc.symbol AS best_call_symbol,
        bc.return_30d AS best_call_return,
        bc.score AS best_call_score,
        bc.call_date AS best_call_date,
        bc.direction AS best_call_direction,
        wc.symbol AS worst_call_symbol,
        wc.return_30d AS worst_call_return,
        wc.score AS worst_call_score,
        wc.call_date AS worst_call_date,
        wc.direction AS worst_call_direction
      FROM creator_stats cs
      JOIN creators c ON c.id = cs.creator_id
      LEFT JOIN calls bc ON bc.id = cs.best_call_id
      LEFT JOIN calls wc ON wc.id = cs.worst_call_id
      WHERE cs.period = $1
      ORDER BY cs.accuracy_rank ASC NULLS LAST`,
      ["all_time"],
    );
    console.log(`Got ${rows.length} rows`);
    if (rows.length > 0) {
      const first = rows[0] as Record<string, unknown>;
      console.log("First row:", JSON.stringify(first, null, 2));
    }
  } catch (err) {
    console.error("QUERY ERROR:", err);
  }

  // Also test the stats query
  try {
    const statsRows = await query(
      `SELECT
        COALESCE(SUM(total_calls), 0)::text AS total_calls,
        CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(win_rate), 1)::text ELSE '--' END AS avg_accuracy,
        COUNT(DISTINCT creator_id)::text AS creator_count
      FROM creator_stats WHERE period = 'all_time'`,
    );
    console.log("Stats:", statsRows[0]);
  } catch (err) {
    console.error("STATS ERROR:", err);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
