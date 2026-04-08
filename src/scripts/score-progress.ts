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
  const r = await query<{ scored: string; unscored: string; total: string }>(
    `SELECT
      COUNT(*) FILTER (WHERE score != 0)::text as scored,
      COUNT(*) FILTER (WHERE score = 0 AND price_at_call IS NOT NULL AND return_30d IS NOT NULL)::text as unscored,
      COUNT(*) FILTER (WHERE price_at_call IS NOT NULL)::text as total
    FROM calls`,
  );
  console.log(JSON.stringify(r[0], null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
