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
  const c = await query<{ symbol: string; n: string }>(
    "SELECT symbol, COUNT(*)::text as n FROM calls GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 20",
  );
  console.log("Top call symbols:");
  for (const r of c) console.log(` ${r.symbol}: ${r.n}`);

  const cd = await query<{ symbol: string }>("SELECT DISTINCT symbol FROM candles ORDER BY symbol LIMIT 30");
  console.log("\nCandle symbols sample:");
  for (const r of cd) console.log(` ${r.symbol}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
