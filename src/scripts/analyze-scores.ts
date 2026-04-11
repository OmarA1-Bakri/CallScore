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

  // Score distribution histogram
  const buckets = await query<{ bucket: string; cnt: string }>(
    `SELECT
      CASE
        WHEN score < -30 THEN 'A: < -30'
        WHEN score < -10 THEN 'B: -30 to -10'
        WHEN score < 0 THEN 'C: -10 to 0'
        WHEN score = 0 THEN 'D: exactly 0'
        WHEN score < 20 THEN 'E: 0 to 20'
        WHEN score < 40 THEN 'F: 20 to 40'
        WHEN score < 60 THEN 'G: 40 to 60'
        ELSE 'H: 60+'
      END as bucket,
      COUNT(*)::text as cnt
    FROM calls
    WHERE price_at_call IS NOT NULL AND extraction_confidence >= 0.5
    GROUP BY bucket
    ORDER BY bucket`,
  );

  console.log("=== SCORE DISTRIBUTION ===\n");
  const total = buckets.reduce((s, b) => s + parseInt(b.cnt, 10), 0);
  for (const b of buckets) {
    const cnt = parseInt(b.cnt, 10);
    const pct = ((cnt / total) * 100).toFixed(1);
    const bar = "#".repeat(Math.round(cnt / 20));
    console.log(`  ${b.bucket.padEnd(15)} ${b.cnt.padStart(5)} (${pct.padStart(5)}%)  ${bar}`);
  }

  // Per-creator score stats
  const creators = await query<{
    name: string; avg_score: number; stddev: number;
    min_score: number; max_score: number; median_score: number;
    cnt: string; pct_negative: number;
  }>(
    `SELECT cr.name,
      AVG(c.score) as avg_score,
      STDDEV_POP(c.score) as stddev,
      MIN(c.score) as min_score,
      MAX(c.score) as max_score,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.score) as median_score,
      COUNT(*)::text as cnt,
      AVG(CASE WHEN c.score < 0 THEN 1.0 ELSE 0.0 END) as pct_negative
    FROM calls c
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.price_at_call IS NOT NULL AND c.extraction_confidence >= 0.5
    GROUP BY cr.name
    ORDER BY AVG(c.score) DESC`,
  );

  console.log("\n=== PER-CREATOR SCORE DISTRIBUTION ===\n");
  console.log("Name                       Avg    Median  StdDev   Min     Max   Calls  %Neg");
  console.log("-------------------------  -----  ------  ------  -----  -----  -----  ----");
  for (const c of creators) {
    const name = c.name.substring(0, 25).padEnd(25);
    const avg = c.avg_score.toFixed(1).padStart(5);
    const med = c.median_score.toFixed(1).padStart(6);
    const std = c.stddev.toFixed(1).padStart(6);
    const min = c.min_score.toFixed(0).padStart(5);
    const max = c.max_score.toFixed(0).padStart(5);
    const cnt = c.cnt.padStart(5);
    const neg = (c.pct_negative * 100).toFixed(0).padStart(3) + "%";
    console.log(`${name}  ${avg}  ${med}  ${std}  ${min}  ${max}  ${cnt}  ${neg}`);
  }

  // Consistency analysis: CV and Sharpe-like ratio
  console.log("\n=== CONSISTENCY METRICS ===\n");
  console.log("Name                       Avg    StdDev   CV     Sharpe  EffRatio");
  console.log("-------------------------  -----  ------  -----  ------  --------");

  const statsRows = await query<{
    name: string; avg_score: number; stddev: number;
    total: string; effective_n: string;
  }>(
    `SELECT cr.name, AVG(c.score) as avg_score, STDDEV_POP(c.score) as stddev,
      COUNT(*)::text as total,
      COUNT(DISTINCT (c.symbol || ':' || c.direction || ':' || TO_CHAR(c.call_date, 'YYYY-MM')))::text as effective_n
    FROM calls c
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.price_at_call IS NOT NULL AND c.extraction_confidence >= 0.5
    GROUP BY cr.name
    ORDER BY AVG(c.score) DESC`,
  );

  for (const s of statsRows) {
    const name = s.name.substring(0, 25).padEnd(25);
    const avg = s.avg_score.toFixed(1).padStart(5);
    const std = s.stddev.toFixed(1).padStart(6);
    const cv = s.stddev > 0 ? (s.stddev / Math.max(Math.abs(s.avg_score), 1)).toFixed(2).padStart(5) : "  N/A";
    const sharpe = s.stddev > 0 ? (s.avg_score / s.stddev).toFixed(3).padStart(6) : "   N/A";
    const totalN = parseInt(s.total, 10);
    const effN = parseInt(s.effective_n, 10);
    const effRatio = ((effN / totalN) * 100).toFixed(0).padStart(5) + "%";
    console.log(`${name}  ${avg}  ${std}  ${cv}  ${sharpe}  ${effRatio}`);
  }

  // Alpha vs return comparison
  console.log("\n=== ALPHA vs RETURN (all_time) ===\n");
  const alphaReturn = await query<{
    name: string; alpha_score: number; avg_alpha: number; avg_return: number;
    accuracy_rank: number | null;
  }>(
    `SELECT cr.name, cs.alpha_score, cs.avg_alpha_30d as avg_alpha,
      cs.avg_return_30d as avg_return, cs.accuracy_rank
    FROM creator_stats cs
    JOIN creators cr ON cr.id = cs.creator_id
    WHERE cs.period = 'all_time'
    ORDER BY cs.accuracy_rank ASC NULLS LAST`,
  );

  console.log("Rank  Name                       AlphaScore  AvgAlpha  AvgReturn  AlphaGap");
  console.log("----  -------------------------  ----------  --------  ---------  --------");
  for (const r of alphaReturn) {
    const rank = (r.accuracy_rank ?? 0).toString().padStart(4);
    const name = r.name.substring(0, 25).padEnd(25);
    const alphaScore = r.alpha_score.toFixed(1).padStart(10);
    const avgAlpha = r.avg_alpha.toFixed(1).padStart(8) + "%";
    const avgReturn = r.avg_return.toFixed(1).padStart(8) + "%";
    const gap = (r.avg_return - r.avg_alpha).toFixed(1).padStart(7) + "%";
    console.log(`${rank}  ${name}  ${alphaScore}  ${avgAlpha}  ${avgReturn}  ${gap}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
