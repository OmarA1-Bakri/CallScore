import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const WORKFLOW_RECEIPT_ROOT = ".tmp/workflow-receipts";

export type WorkflowReceiptResult = "passed" | "failed" | "blocked" | "skipped";

export interface WorkflowReceipt {
  readonly run_id: string;
  readonly workflow_name: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly command: string;
  readonly result: WorkflowReceiptResult;
  readonly blockers: readonly string[];
  readonly approval_evidence: string | null;
  readonly next_action: string;
}

export interface WorkflowReceiptWriteResult {
  readonly path: string;
  readonly receipt: WorkflowReceipt;
}

const DANGEROUS_WORKFLOW_RE = /(?:publish|public[_-]?(?:action|posting|publication|marketing)|outreach|email|dm|message|spend|paid|ad\b|whop[_-]?(?:mutation|write|pricing|customer|payment)|db[_-]?(?:mutation|write)|credential[_-]?rotation|destructive|open[_-]?ended|deploy)/i;

function safeSegment(value: string, field: string): string {
  const raw = value.trim();
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    throw new Error(`${field} is not safe for a receipt path`);
  }
  const normalized = raw.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("..")) {
    throw new Error(`${field} is not safe for a receipt path`);
  }
  if (normalized.length > 160) throw new Error(`${field} is too long for a receipt path`);
  return normalized;
}

export function isApprovalRequiredWorkflow(workflowName: string, command = ""): boolean {
  return DANGEROUS_WORKFLOW_RE.test(`${workflowName} ${command}`);
}

export function buildWorkflowReceiptPath(receipt: Pick<WorkflowReceipt, "workflow_name" | "run_id">, root = WORKFLOW_RECEIPT_ROOT): string {
  const workflow = safeSegment(receipt.workflow_name, "workflow_name");
  const runId = safeSegment(receipt.run_id, "run_id");
  const base = resolve(root);
  const out = resolve(join(base, workflow, `${runId}.json`));
  if (!out.startsWith(`${base}/`) && out !== base) throw new Error("receipt path escapes root");
  return out;
}

export function enforceWorkflowApprovalGate(receipt: WorkflowReceipt): WorkflowReceipt {
  if (!isApprovalRequiredWorkflow(receipt.workflow_name, receipt.command)) return receipt;
  if (receipt.approval_evidence && receipt.approval_evidence.trim()) return receipt;
  const blockers = new Set([...receipt.blockers, "approval_missing"]);
  return {
    ...receipt,
    result: "blocked",
    blockers: [...blockers],
    next_action: receipt.next_action || "Provide explicit approval receipt before any public/spend/revenue/DB/provider mutation action.",
  };
}

export function writeWorkflowReceipt(receipt: WorkflowReceipt, root = WORKFLOW_RECEIPT_ROOT): WorkflowReceiptWriteResult {
  const gated = enforceWorkflowApprovalGate(receipt);
  const out = buildWorkflowReceiptPath(gated, root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(gated, null, 2)}\n`, { mode: 0o600 });
  return { path: out, receipt: gated };
}
