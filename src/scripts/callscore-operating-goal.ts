import { randomUUID } from "node:crypto";
import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../lib/workplane/callscore-operating-graph";
import { OperatingGoalModeSchema, OperatingGoalSchema, type OperatingGoal } from "../lib/workplane/operating-goals";

function valueAfter(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
}

function parseBooleanFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function parseOperatingGoalCliArgs(argv = process.argv.slice(2)) {
  const goalRaw = valueAfter(argv, "--goal");
  if (!goalRaw) throw new Error("--goal is required");
  const goal = OperatingGoalSchema.parse(goalRaw) as OperatingGoal;
  const modeRaw = valueAfter(argv, "--mode")
    ?? (argv.includes("--approved") ? "approved_publish" : argv.includes("--read-live") ? "read_live" : argv.includes("--draft-only") ? "draft_only" : "dry_run");
  const mode = OperatingGoalModeSchema.parse(modeRaw);
  const dryRun = argv.includes("--dry-run") || mode === "dry_run" || mode === "draft_only";
  const maxItemsRaw = valueAfter(argv, "--max-items");
  const maxItems = maxItemsRaw ? Number(maxItemsRaw) : 1;

  return {
    goal,
    mode,
    dryRun,
    approved: parseBooleanFlag(argv, "--approved"),
    approvalReceiptId: valueAfter(argv, "--approval-receipt-id"),
    approvedByOperator: valueAfter(argv, "--approved-by-operator"),
    bounded: !argv.includes("--unbounded"),
    maxItems: Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 1,
    campaignId: valueAfter(argv, "--campaign-id"),
    videoJobId: valueAfter(argv, "--video-job-id"),
    testFixtures: parseBooleanFlag(argv, "--test-fixtures"),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const input = parseOperatingGoalCliArgs(argv);
  const graph = createCallscoreOperatingGraph();
  const result = await graph.invoke(
    buildInitialOperatingState(input),
    { configurable: { thread_id: `callscore-operating-${input.goal}-${randomUUID()}` } },
  );
  const failed = result.errors.length > 0 || result.node_results.some((item) => item.status === "failed");
  const summaryNode = result.node_results.find((item) => item.node_id === "operating_summary");
  const blocked = result.blockers.length > 0 || summaryNode?.status === "blocked";
  const summary = {
    goal: result.config.goal,
    mode: result.config.mode,
    status: failed ? "failed" : blocked ? "blocked" : "ok",
    node_count: result.node_results.length,
    receipt_count: result.receipts.length,
    blockers: result.blockers,
    warnings: result.warnings,
    mutation_flags: result.mutation_flags,
    latest_receipt_id: result.receipts.at(-1)?.receipt_id ?? null,
    latest_receipt_path: result.node_results.find((item) => item.node_id === "collect_receipts")?.artifact_path ?? null,
    latest_summary_path: typeof result.artifacts.operating_summary_path === "string" ? result.artifacts.operating_summary_path : null,
    latest_artifact_path: result.node_results.at(-1)?.artifact_path ?? null,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ status: "failed", error: message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
