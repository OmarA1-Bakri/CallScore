import * as fs from "fs";
import * as path from "path";
import { createLogger } from "../lib/logger";
import { recomputeAllStats, recomputeScopedCallScores } from "../lib/recompute-stats";

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

type ComputeScoresArgs =
  | { readonly mode: "full" }
  | { readonly mode: "canary"; readonly callIds: readonly number[]; readonly videoId: number | null; readonly limit: number };

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(value: string | null, label: string): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function parsePositiveIntList(value: string | null, label: string): readonly number[] {
  if (value === null) return [];
  const parsed = value.split(",").map((part) => parsePositiveInt(part.trim(), label));
  return Array.from(new Set(parsed.filter((item): item is number => item !== null)));
}

export function parseComputeScoresArgs(argv = process.argv.slice(2)): ComputeScoresArgs {
  if (argv.length === 0) return { mode: "full" };
  if (argv.length === 1 && argv[0] === "--confirm-full-recompute") return { mode: "full" };

  const allowed = new Set(["--call-id", "--call-ids", "--video-id", "--limit"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    if (!allowed.has(token)) {
      throw new Error(`Unsupported compute-scores arguments: ${argv.join(" ")}. This script performs a full public score recompute unless a bounded --call-id/--call-ids/--video-id canary is supplied.`);
    }
    index += 1;
  }

  const callIds = [
    ...parsePositiveIntList(argValue(argv, "--call-id"), "--call-id"),
    ...parsePositiveIntList(argValue(argv, "--call-ids"), "--call-ids"),
  ];
  const videoId = parsePositiveInt(argValue(argv, "--video-id"), "--video-id");
  const limit = parsePositiveInt(argValue(argv, "--limit"), "--limit") ?? 5;
  if (limit > 5) throw new Error("bounded score canary --limit must be <=5");
  if (callIds.length === 0 && videoId === null) {
    throw new Error("bounded score canary requires --call-id, --call-ids, or --video-id");
  }
  return { mode: "canary", callIds: Array.from(new Set(callIds)), videoId, limit };
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
  const args = parseComputeScoresArgs();

  if (args.mode === "canary") {
    logger.info("bounded_score_canary_start", args);
    const startedAt = Date.now();
    const metrics = await recomputeScopedCallScores({
      callIds: args.callIds,
      videoId: args.videoId ?? undefined,
      limit: args.limit,
    });
    logger.info("bounded_score_canary_complete", { ...metrics, elapsed_ms: Date.now() - startedAt });
    return;
  }

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
