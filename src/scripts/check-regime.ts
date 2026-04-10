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
    const key = t.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = t.slice(i + 1).trim();
  }
}

async function main(): Promise<void> {
  loadEnv();

  const coverage = await query<{
    total: string;
    with_regime: string;
    null_regime: string;
    min_regime: number | null;
    max_regime: number | null;
  }>(
    `SELECT
      COUNT(*)::text as total,
      COUNT(regime)::text as with_regime,
      COUNT(*) FILTER (WHERE regime IS NULL)::text as null_regime,
      MIN(regime) as min_regime,
      MAX(regime) as max_regime
    FROM candles`,
  );
  console.log("Regime coverage:", JSON.stringify(coverage[0], null, 2));

  const sample = await query<{ open_time: string; regime: number | null }>(
    `SELECT open_time, regime
     FROM candles
     WHERE symbol = 'BTCUSDT' AND regime IS NOT NULL
     ORDER BY open_time DESC
     LIMIT 5`,
  );
  console.log("\nRecent BTC regimes:", JSON.stringify(sample, null, 2));

  // Check regime distribution across calls
  const callRegimes = await query<{ regime: string; count: string }>(
    `SELECT COALESCE(regime_at_call::text, 'null') as regime,
            COUNT(*)::text as count
     FROM calls
     WHERE price_at_call IS NOT NULL
     GROUP BY regime_at_call
     ORDER BY regime_at_call NULLS LAST`,
  );
  console.log("\nCall regime distribution:");
  for (const r of callRegimes) {
    console.log(`  Regime ${r.regime}: ${r.count} calls`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
