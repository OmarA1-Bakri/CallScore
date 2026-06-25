import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OperatingDomain, OperatingGoal } from "./operating-goals";
import { OperatingReceiptSchema, type OperatingReceipt } from "./operating-graph-schemas";

const DEFAULT_RECEIPT_ROOT = ".tmp/workflow-receipts/callscore_operating_graph";

export function generateOperatingReceiptId(goal: OperatingGoal | string, nodeId: string): string {
  const seed = `${goal}:${nodeId}:${Date.now()}:${Math.random()}`;
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `op-${String(goal).replace(/[^a-z0-9_-]/gi, "_")}-${String(nodeId).replace(/[^a-z0-9_-]/gi, "_")}-${digest}`;
}

export function buildOperatingReceiptPath(input: { receiptId: string; artifactDir?: string }): string {
  return join(input.artifactDir ?? DEFAULT_RECEIPT_ROOT, `${input.receiptId}.json`);
}

export function redactCommandOutput(output: string): string {
  return output
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|ACCESS_KEY|PRIVATE_KEY|COOKIE|DATABASE_URL|DATABASE_URI|DB_URL|CONNECTION_STRING)[A-Z0-9_]*)\s*=\s*[^\s\n]+/gi, "$1=[REDACTED]")
    .replace(/\b(password|passwd|pwd)\s*[:=]\s*[^\s\n]+/gi, "$1: [REDACTED]")
    .replace(/Authorization:\s*Bearer\s+[^\s\n]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [REDACTED]");
}

function redactUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => {
      if (/(token|secret|password|passwd|api[_-]?key|cookie|private[_-]?key)/i.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, redactUnknown(inner)];
    }));
  }
  if (typeof value === "string") return redactCommandOutput(value);
  return value;
}

export function writeOperatingReceipt(input: { path: string; receipt: OperatingReceipt }): string {
  const parsed = OperatingReceiptSchema.parse(input.receipt);
  mkdirSync(dirname(input.path), { recursive: true });
  writeFileSync(input.path, `${JSON.stringify(redactUnknown(parsed), null, 2)}\n`);
  return input.path;
}

export function makeNoMutationReceipt(input: {
  receiptId: string;
  goal: OperatingGoal;
  domain: OperatingDomain;
  nodeResults?: OperatingReceipt["node_results"];
  parentReceiptIds?: readonly string[];
  artifactPaths?: readonly string[];
  note?: string;
}): OperatingReceipt {
  return OperatingReceiptSchema.parse({
    receipt_id: input.receiptId,
    goal: input.goal,
    domain: input.domain,
    parent_receipt_ids: [...(input.parentReceiptIds ?? [])],
    node_results: input.nodeResults ?? [],
    mutation_flags: {},
    approval_receipt_id: null,
    rollback_or_recovery_note: input.note ?? "No rollback required; no external mutation performed.",
    artifact_paths: [...(input.artifactPaths ?? [])],
    created_at: new Date().toISOString(),
  });
}
