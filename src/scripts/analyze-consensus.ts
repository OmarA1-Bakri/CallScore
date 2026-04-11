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
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

async function main(): Promise<void> {
  loadEnv();

  // Overall
  const overall = await query<{ total: string; correct: string; wrong: string; pending: string }>(
    `SELECT COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE correct = true)::text as correct,
            COUNT(*) FILTER (WHERE correct = false)::text as wrong,
            COUNT(*) FILTER (WHERE correct IS NULL)::text as pending
     FROM consensus_signals`,
  );
  const o = overall[0];
  console.log("=== CONSENSUS SIGNAL ANALYSIS ===\n");
  console.log(`Total: ${o.total}, Correct: ${o.correct}, Wrong: ${o.wrong}, Pending: ${o.pending}`);

  // By quality_score quartile
  const byQuality = await query<{
    quality_bucket: string; total: string; correct: string; avg_quality: number; avg_return: number;
  }>(
    `SELECT
      CASE
        WHEN quality_score >= 8 THEN 'A: high (>=8)'
        WHEN quality_score >= 6 THEN 'B: mid (6-8)'
        ELSE 'C: low (<6)'
      END as quality_bucket,
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE correct = true)::text as correct,
      AVG(quality_score) as avg_quality,
      AVG(return_30d) as avg_return
    FROM consensus_signals
    WHERE correct IS NOT NULL
    GROUP BY quality_bucket
    ORDER BY quality_bucket`,
  );
  console.log("\n--- By Quality Score ---");
  for (const q of byQuality) {
    const total = parseInt(q.total, 10);
    const correct = parseInt(q.correct, 10);
    const rate = total > 0 ? ((correct / total) * 100).toFixed(1) : "N/A";
    console.log(`  ${q.quality_bucket}: ${q.total} signals, ${rate}% accurate, avg quality=${q.avg_quality?.toFixed(2)}, avg return=${q.avg_return?.toFixed(2)}%`);
  }

  // By direction
  const byDirection = await query<{
    direction: string; total: string; correct: string; avg_return: number;
  }>(
    `SELECT direction,
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE correct = true)::text as correct,
            AVG(return_30d) as avg_return
     FROM consensus_signals
     WHERE correct IS NOT NULL
     GROUP BY direction`,
  );
  console.log("\n--- By Direction ---");
  for (const d of byDirection) {
    const total = parseInt(d.total, 10);
    const correct = parseInt(d.correct, 10);
    const rate = total > 0 ? ((correct / total) * 100).toFixed(1) : "N/A";
    console.log(`  ${d.direction}: ${d.total} signals, ${rate}% accurate, avg return=${d.avg_return?.toFixed(2)}%`);
  }

  // By symbol
  const bySymbol = await query<{
    symbol: string; total: string; correct: string; avg_return: number;
  }>(
    `SELECT symbol,
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE correct = true)::text as correct,
            AVG(return_30d) as avg_return
     FROM consensus_signals
     WHERE correct IS NOT NULL
     GROUP BY symbol
     ORDER BY COUNT(*) DESC`,
  );
  console.log("\n--- By Symbol ---");
  for (const s of bySymbol) {
    const total = parseInt(s.total, 10);
    const correct = parseInt(s.correct, 10);
    const rate = total > 0 ? ((correct / total) * 100).toFixed(1) : "N/A";
    console.log(`  ${s.symbol}: ${s.total} signals, ${rate}% accurate, avg return=${s.avg_return?.toFixed(2)}%`);
  }

  // By creator count
  const byCount = await query<{
    count_bucket: string; total: string; correct: string; avg_return: number;
  }>(
    `SELECT
      CASE
        WHEN creator_count >= 10 THEN 'A: 10+ creators'
        WHEN creator_count >= 6 THEN 'B: 6-9 creators'
        ELSE 'C: 4-5 creators'
      END as count_bucket,
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE correct = true)::text as correct,
      AVG(return_30d) as avg_return
    FROM consensus_signals
    WHERE correct IS NOT NULL
    GROUP BY count_bucket
    ORDER BY count_bucket`,
  );
  console.log("\n--- By Creator Count ---");
  for (const c of byCount) {
    const total = parseInt(c.total, 10);
    const correct = parseInt(c.correct, 10);
    const rate = total > 0 ? ((correct / total) * 100).toFixed(1) : "N/A";
    console.log(`  ${c.count_bucket}: ${c.total} signals, ${rate}% accurate, avg return=${c.avg_return?.toFixed(2)}%`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
