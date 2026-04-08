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
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadEnv();
  const v = await query<{ total: string; done: string; pending: string }>(
    "SELECT COUNT(*)::text as total, COUNT(published_at)::text as done, COUNT(*) FILTER (WHERE published_at IS NULL)::text as pending FROM videos",
  );
  console.log("VIDEOS:", v[0]);

  const c = await query<{ total: string; nonzero: string; with_call_date: string }>(
    `SELECT COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE return_30d IS NOT NULL AND return_30d != 0)::text as nonzero,
            COUNT(*) FILTER (WHERE call_date IS NOT NULL)::text as with_call_date
     FROM calls`,
  );
  console.log("CALLS:", c[0]);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
