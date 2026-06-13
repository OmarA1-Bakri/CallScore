import { writeWorkflowReceipt, type WorkflowReceipt, type WorkflowReceiptResult } from "../lib/workflow-receipts";
import { timestamp } from "./script-helpers";

function valueAfter(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0 || !argv[i + 1]) return null;
  return argv[i + 1];
}

function valuesAfter(argv: readonly string[], flag: string): readonly string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === flag && argv[i + 1]) values.push(argv[++i]);
  return values;
}

function requireArg(argv: readonly string[], flag: string): string {
  const value = valueAfter(argv, flag);
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

function parseResult(value: string | null): WorkflowReceiptResult {
  if (value === "passed" || value === "failed" || value === "blocked" || value === "skipped") return value;
  return "passed";
}

export function buildReceiptFromArgv(argv = process.argv.slice(2), now = timestamp()): WorkflowReceipt {
  const startedAt = valueAfter(argv, "--started-at") ?? now;
  return {
    run_id: valueAfter(argv, "--run-id") ?? `${requireArg(argv, "--workflow")}-${now.replace(/[:.]/g, "")}`,
    workflow_name: requireArg(argv, "--workflow"),
    started_at: startedAt,
    finished_at: valueAfter(argv, "--finished-at") ?? now,
    command: valueAfter(argv, "--command") ?? "manual receipt",
    result: parseResult(valueAfter(argv, "--result")),
    blockers: valuesAfter(argv, "--blocker"),
    approval_evidence: valueAfter(argv, "--approval-evidence"),
    next_action: valueAfter(argv, "--next-action") ?? "review receipt and continue from the next safe action",
  };
}

export function main(argv = process.argv.slice(2)): void {
  const root = valueAfter(argv, "--root") ?? undefined;
  const { path, receipt } = writeWorkflowReceipt(buildReceiptFromArgv(argv), root);
  console.log(JSON.stringify({ ok: receipt.result !== "blocked", path, workflow_name: receipt.workflow_name, result: receipt.result, blockers: receipt.blockers }, null, 2));
  if (receipt.result === "blocked") process.exitCode = 78;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
