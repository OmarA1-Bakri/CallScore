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

  const rows = await query<{
    name: string; bull_cnt: string; bear_cnt: string;
    bull_score: number | null; bear_score: number | null; total: string;
  }>(
    `SELECT cr.name,
      COUNT(*) FILTER (WHERE c.direction = 'bullish')::text as bull_cnt,
      COUNT(*) FILTER (WHERE c.direction = 'bearish')::text as bear_cnt,
      AVG(CASE WHEN c.direction='bullish' THEN c.score END) as bull_score,
      AVG(CASE WHEN c.direction='bearish' THEN c.score END) as bear_score,
      COUNT(*)::text as total
    FROM calls c
    JOIN creators cr ON cr.id = c.creator_id
    WHERE c.price_at_call IS NOT NULL AND c.extraction_confidence >= 0.5
    GROUP BY cr.name
    ORDER BY COUNT(*) FILTER (WHERE c.direction='bearish')::float / NULLIF(COUNT(*),0) DESC`,
  );

  console.log("=== PER-CREATOR DIRECTION MIX ===\n");
  console.log("Name                       Bull  Bear  Bear%  BullScore  BearScore");
  console.log("-------------------------  ----  ----  -----  ---------  ---------");
  for (const r of rows) {
    const total = parseInt(r.total, 10);
    const bearCnt = parseInt(r.bear_cnt, 10);
    const bearPct = ((bearCnt / total) * 100).toFixed(0);
    const name = r.name.substring(0, 25).padEnd(25);
    const bullScore = r.bull_score !== null ? r.bull_score.toFixed(1).padStart(9) : "        -";
    const bearScore = r.bear_score !== null ? r.bear_score.toFixed(1).padStart(9) : "        -";
    console.log(`${name}  ${r.bull_cnt.padStart(4)}  ${r.bear_cnt.padStart(4)}  ${bearPct.padStart(3)}%  ${bullScore}  ${bearScore}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
