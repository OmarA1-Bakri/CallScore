import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { REGIME_LABELS } from "../lib/constants";

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

  // Regime distribution across all matched calls
  const regimes = await query<{ regime: number | null; cnt: string; avg_score: number; win_rate: number }>(
    `SELECT regime_at_call as regime,
            COUNT(*)::text as cnt,
            AVG(score) as avg_score,
            AVG(CASE WHEN correct_direction = true THEN 1.0 ELSE 0.0 END) as win_rate
     FROM calls
     WHERE price_at_call IS NOT NULL AND extraction_confidence >= 0.5
     GROUP BY regime_at_call
     ORDER BY regime_at_call NULLS LAST`,
  );

  console.log("=== REGIME DISTRIBUTION ===\n");
  console.log("Regime          Count    AvgScore  WinRate");
  console.log("──────────────  ───────  ────────  ───────");
  for (const r of regimes) {
    const label = r.regime !== null ? (REGIME_LABELS[r.regime] ?? `Unknown(${r.regime})`).padEnd(14) : "NULL".padEnd(14);
    const cnt = parseInt(r.cnt, 10).toString().padStart(7);
    const score = (r.avg_score ?? 0).toFixed(2).padStart(8);
    const winRate = ((r.win_rate ?? 0) * 100).toFixed(1).padStart(5) + "%";
    console.log(`${label}  ${cnt}  ${score}  ${winRate}`);
  }

  // Regime difficulty bonus impact: how much does it add to scores?
  const regimeBonusImpact = await query<{ regime: number; avg_difficulty: number; cnt: string }>(
    `SELECT regime_at_call as regime,
            AVG(regime_difficulty) as avg_difficulty,
            COUNT(*)::text as cnt
     FROM calls
     WHERE price_at_call IS NOT NULL
       AND extraction_confidence >= 0.5
       AND correct_direction = true
     GROUP BY regime_at_call
     ORDER BY regime_at_call NULLS LAST`,
  );

  console.log("\n--- Regime Bonus (correct calls only) ---");
  console.log("Regime          Count  AvgDifficulty  BonusPts");
  for (const r of regimeBonusImpact) {
    const label = (REGIME_LABELS[r.regime] ?? `Unknown(${r.regime})`).padEnd(14);
    const cnt = parseInt(r.cnt, 10).toString().padStart(5);
    const diff = r.avg_difficulty?.toFixed(3).padStart(13);
    const bonus = ((r.avg_difficulty ?? 0.5) * 10).toFixed(1).padStart(8);
    console.log(`${label}  ${cnt}  ${diff}  ${bonus}`);
  }

  // Score distribution by direction
  const byDir = await query<{ direction: string; cnt: string; avg_score: number; pct_correct: number }>(
    `SELECT direction,
            COUNT(*)::text as cnt,
            AVG(score) as avg_score,
            AVG(CASE WHEN correct_direction = true THEN 1.0 ELSE 0.0 END) as pct_correct
     FROM calls
     WHERE price_at_call IS NOT NULL AND extraction_confidence >= 0.5
     GROUP BY direction`,
  );

  console.log("\n--- Score by Direction ---");
  for (const d of byDir) {
    console.log(`  ${d.direction}: ${d.cnt} calls, avg score ${d.avg_score?.toFixed(2)}, win rate ${((d.pct_correct ?? 0) * 100).toFixed(1)}%`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
