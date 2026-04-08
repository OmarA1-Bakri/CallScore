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
  const r = await query<{
    name: string;
    total: string;
    with_price: string;
    with_return: string;
    wins: string;
  }>(
    `SELECT cr.name, COUNT(c.id)::text as total,
            COUNT(c.price_at_call)::text as with_price,
            COUNT(c.return_30d)::text as with_return,
            COUNT(*) FILTER (WHERE c.correct_direction = true)::text as wins
     FROM creators cr
     LEFT JOIN calls c ON c.creator_id = cr.id
     WHERE cr.name = 'Sheldon Evans'
     GROUP BY cr.name`,
  );
  console.log(r[0]);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
