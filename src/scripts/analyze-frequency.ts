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

  // Check stale stats
  const stale = await query<{ name: string; period: string; total_calls: number }>(
    `SELECT cr.name, cs.period, cs.total_calls
     FROM creator_stats cs
     JOIN creators cr ON cr.id = cs.creator_id
     WHERE cs.creator_id NOT IN (
       SELECT DISTINCT creator_id FROM calls
       WHERE price_at_call IS NOT NULL AND extraction_confidence >= 0.5
     )`,
  );
  console.log(`Stale creator_stats rows: ${stale.length}`);
  for (const r of stale) console.log(`  ${r.name} [${r.period}] calls=${r.total_calls}`);

  // Call frequency analysis
  const freq = await query<{
    name: string; total: string; effective_n: string; repetition: number;
  }>(
    `SELECT cr.name, COUNT(*)::text as total,
      COUNT(DISTINCT (c.symbol || ':' || c.direction || ':' || TO_CHAR(c.call_date, 'YYYY-MM')))::text as effective_n,
      ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT (c.symbol || ':' || c.direction || ':' || TO_CHAR(c.call_date, 'YYYY-MM'))), 0), 1) as repetition
    FROM calls c JOIN creators cr ON cr.id = c.creator_id
    WHERE c.price_at_call IS NOT NULL AND c.extraction_confidence >= 0.5
    GROUP BY cr.name ORDER BY repetition DESC`,
  );

  console.log("\n=== CALL FREQUENCY (repetition factor) ===");
  console.log("Name                       Total  EffN  Rep  EffRatio");
  for (const r of freq) {
    const total = parseInt(r.total, 10);
    const effN = parseInt(r.effective_n, 10);
    const ratio = ((effN / total) * 100).toFixed(0);
    console.log(
      `  ${r.name.substring(0, 25).padEnd(25)} ${r.total.padStart(5)}  ${r.effective_n.padStart(4)}  ${r.repetition}x  ${ratio}%`,
    );
  }

  // Top spammed symbol+direction combos
  const spam = await query<{ name: string; symbol: string; direction: string; cnt: string }>(
    `SELECT cr.name, c.symbol, c.direction, COUNT(*)::text as cnt
     FROM calls c JOIN creators cr ON cr.id = c.creator_id
     WHERE c.price_at_call IS NOT NULL AND c.extraction_confidence >= 0.5
     GROUP BY cr.name, c.symbol, c.direction
     HAVING COUNT(*) >= 20
     ORDER BY COUNT(*) DESC LIMIT 15`,
  );

  console.log("\n=== TOP SPAMMED CALL COMBOS (20+) ===");
  for (const s of spam) {
    console.log(`  ${s.name.substring(0, 20).padEnd(20)} ${s.symbol.padEnd(12)} ${s.direction.padEnd(8)} ${s.cnt}x`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
