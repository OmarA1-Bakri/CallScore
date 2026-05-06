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

async function main(): Promise<void> {
  loadEnv();

  console.log("Creating composite index on candles(symbol, open_time DESC)...");
  console.log("This may take a few minutes for 18.7M rows...");

  await query(
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candles_lookup ON candles(symbol, open_time DESC)",
  );

  console.log("Index created successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
