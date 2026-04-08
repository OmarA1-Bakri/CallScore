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
  const r = await query<{ youtube_video_id: string }>(
    "SELECT youtube_video_id FROM videos WHERE published_at IS NULL LIMIT 5",
  );
  for (const v of r) {
    const res = await fetch(`https://invidious.f5.si/api/v1/videos/${v.youtube_video_id}`);
    const data = (await res.json()) as { published?: number; error?: string };
    console.log(v.youtube_video_id, "→", res.status, data.published ?? data.error ?? "no data");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
