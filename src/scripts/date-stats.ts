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
  const v = await query<{
    earliest: string;
    latest: string;
    pre2024: string;
    in2024: string;
    in2025: string;
    in2026: string;
  }>(
    `SELECT
      MIN(published_at)::text as earliest,
      MAX(published_at)::text as latest,
      COUNT(*) FILTER (WHERE published_at < '2024-01-01')::text as pre2024,
      COUNT(*) FILTER (WHERE published_at >= '2024-01-01' AND published_at < '2025-01-01')::text as in2024,
      COUNT(*) FILTER (WHERE published_at >= '2025-01-01' AND published_at < '2026-01-01')::text as in2025,
      COUNT(*) FILTER (WHERE published_at >= '2026-01-01')::text as in2026
    FROM videos WHERE published_at IS NOT NULL`,
  );
  console.log("VIDEOS:", JSON.stringify(v[0], null, 2));

  const c = await query<{
    earliest: string;
    latest: string;
    pre2024: string;
    in2024: string;
    in2025: string;
    in2026: string;
  }>(
    `SELECT
      MIN(call_date)::text as earliest,
      MAX(call_date)::text as latest,
      COUNT(*) FILTER (WHERE call_date < '2024-01-01')::text as pre2024,
      COUNT(*) FILTER (WHERE call_date >= '2024-01-01' AND call_date < '2025-01-01')::text as in2024,
      COUNT(*) FILTER (WHERE call_date >= '2025-01-01' AND call_date < '2026-01-01')::text as in2025,
      COUNT(*) FILTER (WHERE call_date >= '2026-01-01')::text as in2026
    FROM calls WHERE call_date IS NOT NULL`,
  );
  console.log("CALLS:", JSON.stringify(c[0], null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
