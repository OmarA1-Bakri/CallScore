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

interface Stats {
  readonly total: string;
  readonly matched: string;
  readonly pre24_unmatched: string;
  readonly post24_unmatched: string;
  readonly post24_matched: string;
}

async function main(): Promise<void> {
  loadEnv();
  const r = await query<Stats>(
    `SELECT
      COUNT(*)::text as total,
      COUNT(price_at_call)::text as matched,
      COUNT(*) FILTER (WHERE price_at_call IS NULL AND call_date < '2024-01-01')::text as pre24_unmatched,
      COUNT(*) FILTER (WHERE price_at_call IS NULL AND call_date >= '2024-01-01')::text as post24_unmatched,
      COUNT(*) FILTER (WHERE price_at_call IS NOT NULL AND call_date >= '2024-01-01')::text as post24_matched
    FROM calls`,
  );
  console.log(JSON.stringify(r[0], null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
