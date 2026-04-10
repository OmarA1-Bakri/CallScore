/**
 * reset-scores.ts — Quick utility to zero out all call scores
 * so compute-scores.ts will rescore them with the current formula.
 */
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
  const r = await query<{ id: number }>(
    "UPDATE calls SET score = 0 WHERE price_at_call IS NOT NULL AND score != 0 RETURNING id",
  );
  console.log(`Reset ${r.length} call scores to 0`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
