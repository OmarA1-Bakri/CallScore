import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { runPipelineGuardAudit } from "../lib/pipeline-guard-audit";
import { buildTransitionSnapshots, loadTransitionCreators, loadTransitionRows } from "../lib/transition/transition-snapshot";
import { classifyTransitionSnapshots } from "../lib/transition/transition-state-classifier";
import { backtestTransitionStates } from "../lib/transition/transition-backtest";
import { writeTransitionArtifacts } from "../lib/transition/transition-report";
import { assertTransitionSourceAllowed, transitionCanProceedWithGuard } from "../lib/transition/transition-data-policy";
import type { TransitionPeriod } from "../lib/transition/transition-schemas";

dotenv.config({ path: ".env" + ".hermes", quiet: true });
if (!process.env.DATABASE_PROVIDER) process.env.DATABASE_PROVIDER = "postgres";

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || argv[index + 1] === undefined) return null;
  return argv[index + 1];
}

function periodValue(value: string | null): TransitionPeriod {
  if (value === "weekly" || value === "monthly" || value === "quarterly") return value;
  return "monthly";
}

async function main(): Promise<void> {
  assertTransitionSourceAllowed("calls");
  const argv = process.argv.slice(2);
  const period = periodValue(argValue(argv, "--period"));
  const from = argValue(argv, "--from") ?? "2017-11-25";
  const to = argValue(argv, "--to") ?? new Date().toISOString().slice(0, 10);
  const out = argValue(argv, "--out") ?? ".tmp/transition/latest";
  const guardPath = argValue(argv, "--guard");
  const guard = guardPath
    ? JSON.parse(readFileSync(guardPath, "utf8"))
    : await runPipelineGuardAudit();
  if (guard.core_pipeline_status === "blocked" || !transitionCanProceedWithGuard(guard)) {
    throw new Error("transition guard blocked source integrity");
  }
  const [rows, creators] = await Promise.all([
    loadTransitionRows({ from, to }),
    loadTransitionCreators(),
  ]);
  const built = buildTransitionSnapshots({ rows, creators, period });
  const states = classifyTransitionSnapshots(built.snapshots);
  const backtest = backtestTransitionStates(states);
  const artifacts = { snapshots: built.snapshots, states, backtest, exclusions: built.exclusions };
  writeTransitionArtifacts(out, guard, artifacts);
  console.log(JSON.stringify({ out, period, snapshots: artifacts.snapshots.length, states: artifacts.states.length, exclusions: artifacts.exclusions.length, backtest_buckets: artifacts.backtest.buckets.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
