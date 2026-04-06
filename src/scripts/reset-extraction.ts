/**
 * One-time script to reset extraction flags and clear old Groq-extracted calls.
 * Re-run Gemini extraction from scratch on all videos.
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

  console.log("Deleting old calls from unreliable Groq extraction...");
  await query("DELETE FROM calls");
  console.log("Done.");

  console.log("Resetting extraction flags on all videos...");
  await query("UPDATE videos SET calls_extracted = false, extraction_pass = 0");
  console.log("Done.");

  const videos = await query<{ count: string }>("SELECT COUNT(*) as count FROM videos");
  const calls = await query<{ count: string }>("SELECT COUNT(*) as count FROM calls");
  console.log(`Videos in DB: ${videos[0].count}`);
  console.log(`Calls in DB: ${calls[0].count}`);
  console.log("Ready for Gemini extraction.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
