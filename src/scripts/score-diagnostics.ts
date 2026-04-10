/**
 * score-diagnostics.ts
 *
 * Analyze the health and fairness of the scoring rubric.
 * Outputs: score distribution, per-component breakdown, creator-level stats,
 * and flags potential issues.
 */
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

function timestamp(): string {
  return new Date().toISOString();
}

interface ScoreDistRow {
  readonly bucket: string;
  readonly count: string;
}

interface ComponentBreakdown {
  readonly avg_score: number;
  readonly min_score: number;
  readonly max_score: number;
  readonly stddev_score: number;
  readonly median_score: number;
  readonly pct_negative: string;
  readonly pct_zero: string;
  readonly pct_above_50: string;
  readonly total: string;
}

interface DirectionStats {
  readonly direction: string;
  readonly total: string;
  readonly correct: string;
  readonly pct: number;
}

interface ConfidenceStats {
  readonly confidence: string;
  readonly total: string;
  readonly avg_score: number;
}

interface CreatorDiag {
  readonly name: string;
  readonly total_calls: string;
  readonly matched: string;
  readonly scored: string;
  readonly low_confidence: string;
  readonly avg_score: number;
  readonly score_stddev: number;
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`\n=== SCORE DIAGNOSTICS (${timestamp()}) ===\n`);

  // 1. Overall score distribution
  const dist = await query<ScoreDistRow>(
    `SELECT
      CASE
        WHEN score < -10 THEN '< -10'
        WHEN score < 0 THEN '-10 to 0'
        WHEN score < 10 THEN '0 to 10'
        WHEN score < 20 THEN '10 to 20'
        WHEN score < 30 THEN '20 to 30'
        WHEN score < 40 THEN '30 to 40'
        WHEN score < 50 THEN '40 to 50'
        WHEN score < 60 THEN '50 to 60'
        WHEN score < 70 THEN '60 to 70'
        WHEN score < 80 THEN '70 to 80'
        ELSE '80+'
      END as bucket,
      COUNT(*)::text as count
    FROM calls
    WHERE price_at_call IS NOT NULL AND score != 0
    GROUP BY bucket
    ORDER BY MIN(score)`,
  );

  console.log("Score Distribution:");
  for (const d of dist) {
    const count = parseInt(d.count, 10);
    const bar = "#".repeat(Math.min(60, Math.round(count / 10)));
    console.log(`  ${d.bucket.padEnd(12)} ${d.count.padStart(5)}  ${bar}`);
  }

  // 2. Component breakdown
  const comp = await query<ComponentBreakdown>(
    `SELECT
      AVG(score) as avg_score,
      MIN(score) as min_score,
      MAX(score) as max_score,
      STDDEV_POP(score) as stddev_score,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
      COUNT(*) FILTER (WHERE score < 0)::text as pct_negative,
      COUNT(*) FILTER (WHERE score = 0)::text as pct_zero,
      COUNT(*) FILTER (WHERE score > 50)::text as pct_above_50,
      COUNT(*)::text as total
    FROM calls
    WHERE price_at_call IS NOT NULL AND return_30d IS NOT NULL`,
  );

  if (comp.length > 0) {
    const c = comp[0];
    console.log(`\nOverall Stats:`);
    console.log(`  Mean:     ${c.avg_score?.toFixed(2)}`);
    console.log(`  Median:   ${c.median_score?.toFixed(2)}`);
    console.log(`  StdDev:   ${c.stddev_score?.toFixed(2)}`);
    console.log(`  Min/Max:  ${c.min_score?.toFixed(2)} / ${c.max_score?.toFixed(2)}`);
    console.log(`  Negative: ${c.pct_negative} / ${c.total}`);
    console.log(`  Zero:     ${c.pct_zero} / ${c.total}`);
    console.log(`  Above 50: ${c.pct_above_50} / ${c.total}`);
  }

  // 3. Direction correctness by direction type
  const dirStats = await query<DirectionStats>(
    `SELECT direction,
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE correct_direction = true)::text as correct,
            AVG(CASE WHEN correct_direction = true THEN 1.0 ELSE 0.0 END) as pct
     FROM calls
     WHERE price_at_call IS NOT NULL AND return_30d IS NOT NULL
     GROUP BY direction`,
  );

  console.log(`\nDirection Correctness:`);
  for (const d of dirStats) {
    console.log(`  ${d.direction.padEnd(10)} ${d.correct}/${d.total} = ${((d.pct ?? 0) * 100).toFixed(1)}%`);
  }

  // 4. Confidence breakdown
  const confStats = await query<ConfidenceStats>(
    `SELECT COALESCE(confidence, 'null') as confidence,
            COUNT(*)::text as total,
            AVG(score) as avg_score
     FROM calls
     WHERE price_at_call IS NOT NULL AND score != 0
     GROUP BY confidence
     ORDER BY avg_score DESC`,
  );

  console.log(`\nConfidence Breakdown:`);
  for (const c of confStats) {
    console.log(`  ${(c.confidence ?? "null").padEnd(8)} ${c.total.padStart(5)} calls, avg score ${(c.avg_score ?? 0).toFixed(2)}`);
  }

  // 5. Per-creator diagnostics
  const creators = await query<CreatorDiag>(
    `SELECT
      cr.name,
      COUNT(c.id)::text as total_calls,
      COUNT(c.id) FILTER (WHERE c.price_at_call IS NOT NULL)::text as matched,
      COUNT(c.id) FILTER (WHERE c.score != 0)::text as scored,
      COUNT(c.id) FILTER (WHERE c.extraction_confidence < 0.5)::text as low_confidence,
      AVG(c.score) FILTER (WHERE c.score != 0) as avg_score,
      STDDEV_POP(c.score) FILTER (WHERE c.score != 0) as score_stddev
    FROM creators cr
    LEFT JOIN calls c ON c.creator_id = cr.id
    GROUP BY cr.id, cr.name
    ORDER BY avg_score DESC NULLS LAST`,
  );

  console.log(`\nPer-Creator Diagnostics:`);
  console.log("  Name                       Total  Match  Score  LowConf  AvgScore  StdDev");
  console.log("  -------------------------  -----  -----  -----  -------  --------  ------");
  for (const c of creators) {
    const name = c.name.substring(0, 25).padEnd(25);
    const total = c.total_calls.padStart(5);
    const matched = c.matched.padStart(5);
    const scored = c.scored.padStart(5);
    const lowConf = c.low_confidence.padStart(7);
    const avg = (c.avg_score ?? 0).toFixed(1).padStart(8);
    const std = (c.score_stddev ?? 0).toFixed(1).padStart(6);
    console.log(`  ${name}  ${total}  ${matched}  ${scored}  ${lowConf}  ${avg}  ${std}`);
  }

  // 6. Flags
  console.log(`\n=== FLAGS ===`);

  // Check for creators with high % of low-confidence extractions
  for (const c of creators) {
    const matched = parseInt(c.matched, 10);
    const lowConf = parseInt(c.low_confidence, 10);
    if (matched > 0 && lowConf / matched > 0.3) {
      console.log(`  WARNING: ${c.name} has ${lowConf}/${matched} (${((lowConf / matched) * 100).toFixed(0)}%) low-confidence extractions`);
    }
  }

  // Check for creators where Wilson LB < 20%
  const winStats = await query<{ name: string; wins: string; total: string }>(
    `SELECT cr.name,
            COUNT(*) FILTER (WHERE c.correct_direction = true)::text as wins,
            COUNT(*)::text as total
     FROM creators cr
     JOIN calls c ON c.creator_id = cr.id
     WHERE c.price_at_call IS NOT NULL AND c.return_30d IS NOT NULL
     GROUP BY cr.id, cr.name`,
  );

  for (const w of winStats) {
    const wins = parseInt(w.wins, 10);
    const total = parseInt(w.total, 10);
    const wlb = wilsonLowerBound(wins, total);
    if (wlb < 0.2) {
      console.log(`  WARNING: ${w.name} Wilson lower bound ${(wlb * 100).toFixed(1)}% — statistically indistinguishable from random`);
    }
  }

  console.log(`\n=== END DIAGNOSTICS ===\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
