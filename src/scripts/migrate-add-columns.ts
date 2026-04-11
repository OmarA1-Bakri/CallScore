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

  await query("ALTER TABLE creator_stats ADD COLUMN IF NOT EXISTS effective_n INTEGER DEFAULT 0");
  console.log("Added effective_n to creator_stats");

  await query("ALTER TABLE creator_stats ADD COLUMN IF NOT EXISTS wilson_lb DOUBLE PRECISION DEFAULT 0");
  console.log("Added wilson_lb to creator_stats");

  await query("ALTER TABLE consensus_signals ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION");
  console.log("Added quality_score to consensus_signals");

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
