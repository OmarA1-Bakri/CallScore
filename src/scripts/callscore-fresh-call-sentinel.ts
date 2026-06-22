import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { closeDatabasePoolForTests } from "../lib/db";
import {
  loadFreshCallCandidates,
  loadFreshCallExistingDedupeState,
} from "../lib/sentinels/creator-discovery";
import { runFreshCallSentinel, type FreshCallProviderCooldown } from "../lib/sentinels/fresh-call-sentinel";

interface Args {
  readonly limit: number;
  readonly sinceDays: number;
  readonly cooldownState: string | null;
  readonly writeReceipt: boolean;
}

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

export function parseFreshCallSentinelArgs(argv = process.argv.slice(2)): Args {
  return {
    limit: positiveInt(argValue(argv, "--limit"), 25, 250),
    sinceDays: positiveInt(argValue(argv, "--since-days"), 14, 365),
    cooldownState: argValue(argv, "--cooldown-state"),
    writeReceipt: !argv.includes("--no-receipt"),
  };
}

function loadHermesEnv(repoRoot: string): void {
  const local = join(repoRoot, ".env.local");
  const hermes = join(repoRoot, ".env.hermes");
  if (existsSync(local)) dotenv.config({ path: local, quiet: true });
  if (existsSync(hermes)) dotenv.config({ path: hermes, quiet: true, override: false });
}

function cooldownFromState(path: string | null, now: Date): FreshCallProviderCooldown | null {
  if (!path || !existsSync(path)) return { active: false, reason: null, until: null };
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const until = typeof json.cooldown_until_utc === "string" ? json.cooldown_until_utc : null;
    const untilMs = until ? Date.parse(until) : NaN;
    if (Number.isFinite(untilMs) && untilMs > now.getTime()) {
      return {
        active: true,
        reason: typeof json.cooldown_reason === "string" ? json.cooldown_reason : "collector_cooldown",
        until,
      };
    }
    return { active: false, reason: null, until };
  } catch {
    return { active: true, reason: "collector_cooldown_state_malformed", until: null };
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const repoRoot = process.cwd();
  loadHermesEnv(repoRoot);
  const args = parseFreshCallSentinelArgs(argv);
  const now = new Date();
  const cooldownPath = args.cooldownState ?? join(repoRoot, ".tmp", "laptop-collector", "latest-state.json");
  const [candidates, existing] = await Promise.all([
    loadFreshCallCandidates({ limit: args.limit, sinceDays: args.sinceDays }),
    loadFreshCallExistingDedupeState(),
  ]);
  const result = runFreshCallSentinel({
    candidates,
    existing,
    cooldown: cooldownFromState(cooldownPath, now),
    now,
    repoRoot,
    writeReceipt: args.writeReceipt,
  });

  process.stdout.write(`${JSON.stringify({
    discovered_count: result.receipt.discovered_count,
    skipped_duplicate_count: result.receipt.skipped_duplicate_count,
    skipped_cooldown_count: result.receipt.skipped_cooldown_count,
    recommended_count: result.receipt.recommended_count,
    enqueued_count: result.receipt.enqueued_count,
    blockers: result.receipt.blockers,
    receipt_path: result.receipt.receipt_path,
    recommendations: result.recommendations.map((item) => ({
      action: item.action,
      dedupe_key: item.dedupe_key,
      idempotency_key: item.idempotency_key,
      reason_codes: item.reason_codes,
    })),
    production_mutation_performed: false,
    provider_mutation_performed: false,
    external_send_performed: false,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main()
    .then(async () => {
      await closeDatabasePoolForTests();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDatabasePoolForTests().catch(() => undefined);
      process.exit(1);
    });
}
