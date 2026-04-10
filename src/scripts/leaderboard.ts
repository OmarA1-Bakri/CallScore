import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { wilsonLowerBound } from "../lib/scoring";

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

interface Row {
  readonly name: string;
  readonly tier: string;
  readonly accuracy_rank: number | null;
  readonly alpha_score: number;
  readonly win_rate: number;
  readonly avg_alpha_30d: number;
  readonly avg_return_30d: number;
  readonly total_calls: number;
}

async function main(): Promise<void> {
  loadEnv();
  const rows = await query<Row>(
    `SELECT cr.name, cr.tier, cs.accuracy_rank, cs.alpha_score, cs.win_rate,
            cs.avg_alpha_30d, cs.avg_return_30d, cs.total_calls
     FROM creators cr
     JOIN creator_stats cs ON cs.creator_id = cr.id AND cs.period = 'all_time'
     WHERE EXISTS (
       SELECT 1 FROM calls c WHERE c.creator_id = cr.id AND c.price_at_call IS NOT NULL
     )
     ORDER BY cs.accuracy_rank ASC NULLS LAST`,
  );

  console.log("\n=== CRYPTO-TUBER RANKED LEADERBOARD (all_time) ===\n");
  console.log(
    "Rank  Tier    Name                       Score   Win%  WinLB%  Alpha%  Return%  Calls",
  );
  console.log("----  ------  -------------------------  ------  -----  ------  ------  -------  -----");
  for (const r of rows) {
    const rank = r.accuracy_rank?.toString().padStart(4) ?? "  —";
    const tier = r.tier.padEnd(6);
    const name = r.name.substring(0, 25).padEnd(25);
    const score = (r.alpha_score ?? 0).toFixed(1).padStart(6);
    const winRate = ((r.win_rate ?? 0) * 100).toFixed(1).padStart(5);
    // Wilson lower bound: honest floor for win rate given sample size
    const wins = Math.round((r.win_rate ?? 0) * (r.total_calls ?? 0));
    const wlb = (wilsonLowerBound(wins, r.total_calls ?? 0) * 100).toFixed(1).padStart(6);
    const alpha30d = (r.avg_alpha_30d ?? 0).toFixed(1).padStart(6);
    const ret30d = (r.avg_return_30d ?? 0).toFixed(1).padStart(7);
    const calls = (r.total_calls ?? 0).toString().padStart(5);
    console.log(`${rank}  ${tier}  ${name}  ${score}  ${winRate}%  ${wlb}%  ${alpha30d}%  ${ret30d}%  ${calls}`);
  }

  // Period comparison
  const periodStats = await query<{ period: string; creator_count: string; avg_alpha: number }>(
    `SELECT period, COUNT(*)::text as creator_count, AVG(alpha_score) as avg_alpha
     FROM creator_stats
     GROUP BY period
     ORDER BY period`,
  );
  console.log("\n=== Period Stats ===");
  for (const p of periodStats) {
    console.log(`  ${p.period}: ${p.creator_count} creators, avg alpha ${(p.avg_alpha ?? 0).toFixed(2)}`);
  }

  // Consensus
  const consensus = await query<{ total: string; correct: string; accuracy: number }>(
    `SELECT COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE correct = true)::text as correct,
            AVG(CASE WHEN correct = true THEN 1.0 WHEN correct = false THEN 0.0 END) as accuracy
     FROM consensus_signals
     WHERE correct IS NOT NULL`,
  );
  if (consensus.length > 0) {
    const c = consensus[0];
    console.log(`\n=== Consensus Signals ===`);
    console.log(`  Total scored: ${c.total}, Correct: ${c.correct}, Accuracy: ${((c.accuracy ?? 0) * 100).toFixed(1)}%`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
