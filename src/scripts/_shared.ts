/**
 * Shared helpers for tsx-runnable scripts (cron entrypoints).
 * Keep this file dependency-free; it is imported by multiple standalone
 * scripts and must not pull DB/Neon/Next/etc transitively.
 */
import * as fs from "fs";
import * as path from "path";

const ENV_ALREADY_LOADED = Symbol.for("ctr.loadEnv.done");

interface GlobalWithFlag {
  [ENV_ALREADY_LOADED]?: true;
}

/**
 * Hydrate `process.env` from `.env.local` (preferred) or `.env` if they
 * exist at the project root. Existing env vars are NEVER overwritten so
 * shell-supplied values win. Safe to call multiple times.
 */
export function loadEnv(): void {
  const g = globalThis as GlobalWithFlag;
  if (g[ENV_ALREADY_LOADED]) return;
  g[ENV_ALREADY_LOADED] = true;

  if (process.env.NEON_DATABASE_URL) return;

  // __dirname is the compiled location of this file (src/scripts/). The
  // project root is two levels up.
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

export function timestamp(): string {
  return new Date().toISOString();
}
