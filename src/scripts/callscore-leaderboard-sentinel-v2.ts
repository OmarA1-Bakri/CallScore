import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { closeDatabasePoolForTests, withTransaction } from "../lib/db";
import {
  LEADERBOARD_SENTINEL_V2_RECEIPT_SCHEMA,
  persistLeaderboardSentinelV2,
} from "../lib/sentinels/leaderboard-sentinel-v2";
import {
  loadInternalLeaderboardSentinelV2,
  parsePublicLeaderboardV2Payload,
  type ReadOnlyQueryExecutor,
} from "../lib/sentinels/leaderboard-sentinel-v2-data";

interface Args {
  readonly outputRoot: string;
  readonly publicUrl: string;
  readonly scoreMovementThreshold: number;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

export function parseLeaderboardSentinelV2Args(argv = process.argv.slice(2), repoRoot = process.cwd()): Args {
  const thresholdValue = Number(argValue(argv, "--score-threshold") ?? "0.5");
  if (!Number.isFinite(thresholdValue) || thresholdValue < 0) throw new Error("--score-threshold must be a non-negative number");
  return {
    outputRoot: resolve(argValue(argv, "--output-root") ?? join(repoRoot, ".tmp", "workflow-receipts", "leaderboard_sentinel_v2")),
    publicUrl: argValue(argv, "--public-url") ?? "https://call-score.com/api/leaderboard?period=12m",
    scoreMovementThreshold: thresholdValue,
  };
}

function loadEnvironment(repoRoot: string): void {
  const local = join(repoRoot, ".env.local");
  const hermes = join(repoRoot, ".env.hermes");
  if (existsSync(local)) dotenv.config({ path: local, quiet: true });
  if (existsSync(hermes)) dotenv.config({ path: hermes, quiet: true, override: false });
}

async function fetchPublicLeaderboard(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "CallScore-Sentinel-v2/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`public leaderboard HTTP ${response.status}`);
  return response.json();
}

async function loadInternalReadOnly(): Promise<Awaited<ReturnType<typeof loadInternalLeaderboardSentinelV2>>> {
  return withTransaction(async (execute) => {
    await execute("SET TRANSACTION READ ONLY");
    const readOnlyExecute: ReadOnlyQueryExecutor = async (statement, params = []) => {
      const result = await execute(statement, params) as { readonly rows?: readonly Record<string, unknown>[] };
      return result.rows ?? [];
    };
    return loadInternalLeaderboardSentinelV2(readOnlyExecute);
  }, { provider: "postgres" });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(token|password|secret|key)=[^\s&]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const repoRoot = process.cwd();
  loadEnvironment(repoRoot);
  const args = parseLeaderboardSentinelV2Args(argv, repoRoot);
  const generatedAt = new Date().toISOString();
  const [publicPayload, internal] = await Promise.all([
    fetchPublicLeaderboard(args.publicUrl),
    loadInternalReadOnly(),
  ]);
  const publicRows = parsePublicLeaderboardV2Payload(publicPayload);
  const result = persistLeaderboardSentinelV2({
    outputRoot: args.outputRoot,
    generatedAt,
    publicRows,
    internalRows: internal.rows,
    scoreMovementThreshold: args.scoreMovementThreshold,
    operational: internal.operational,
  });
  process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
  if (result.receipt.status === "RED_INTEGRITY_OR_PIPELINE_FAILURE") process.exitCode = 2;
}

if (require.main === module) {
  main()
    .catch((error) => {
      process.stdout.write(`${JSON.stringify({
        schema: LEADERBOARD_SENTINEL_V2_RECEIPT_SCHEMA,
        status: "RED_INTEGRITY_OR_PIPELINE_FAILURE",
        workflow_status: "READ_ONLY_SCAN_FAILED",
        agent: "callscore-sentinel",
        mode: "READ_ONLY_NO_MUTATION",
        generated_at_utc: new Date().toISOString(),
        mutation_flags: {
          db_write_performed: false,
          provider_mutation_performed: false,
          external_mutation_performed: false,
        },
        changes_detected: null,
        alerts: [{ severity: "RED", code: "SENTINEL_V2_RUNTIME_FAILURE", message: safeError(error) }],
        blockers: [safeError(error)],
        next_action: "repair read-only data source or runtime; retry automatically on next scheduled pulse",
      })}\n`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabasePoolForTests().catch(() => undefined);
    });
}
