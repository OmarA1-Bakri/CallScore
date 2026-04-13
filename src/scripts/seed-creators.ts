import * as fs from "fs";
import * as path from "path";
import { query } from "../lib/db";
import { TRACKED_CREATORS } from "../lib/tracked-creators";

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

function timestamp(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  loadEnv();

  console.log(`[${timestamp()}] Seeding ${TRACKED_CREATORS.length} creators...`);

  let success = 0;
  let failed = 0;

  for (const creator of TRACKED_CREATORS) {
    try {
      await query(
        `INSERT INTO creators (name, youtube_handle, subscribers, focus, tier)
         VALUES ($1, $2, $3, $4, 'free')
         ON CONFLICT (youtube_handle) DO UPDATE SET
           name = EXCLUDED.name,
           subscribers = EXCLUDED.subscribers,
           focus = EXCLUDED.focus`,
        [creator.name, creator.youtube_handle, creator.subscribers, creator.focus],
      );
      success++;
      console.log(`[${timestamp()}] OK: ${creator.name} (${creator.youtube_handle})`);
    } catch (error: unknown) {
      failed++;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] FAIL: ${creator.name} -> ${msg}`);
    }
  }

  console.log(`[${timestamp()}] Seed complete: ${success} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Fatal error:`, err);
  process.exit(1);
});
