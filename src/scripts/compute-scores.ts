import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../lib/logger";
import { recomputeAllStats } from "../lib/recompute-stats";

const logger = createLogger({ component: "compute-scores" });

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

export function parseComputeScoresArgs(argv = process.argv.slice(2)): { readonly fullRecompute: true } {
  if (argv.length === 0) return { fullRecompute: true };
  if (argv.length === 1 && argv[0] === "--confirm-full-recompute") return { fullRecompute: true };
  throw new Error(`Unsupported compute-scores arguments: ${argv.join(" ")}. This script performs a full public score recompute; do not pass canary limits. Use --confirm-full-recompute or a dedicated bounded scoring canary.`);
}

export async function runComputeScores(): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  const metrics = await recomputeAllStats();
  return {
    ...metrics,
    elapsed_ms: Date.now() - startedAt,
  };
}

async function main(): Promise<void> {
  loadEnv();
  parseComputeScoresArgs();

  logger.info("public_score_recompute_start");
  const metrics = await runComputeScores();
  logger.info("public_score_recompute_complete", metrics);
}

if (require.main === module) {
  main().catch((err) => {
    logger.error("fatal_error", {
      error: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    process.exit(1);
  });
}
