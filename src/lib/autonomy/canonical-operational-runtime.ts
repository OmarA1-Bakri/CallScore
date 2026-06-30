import { createHash } from "node:crypto";
import { z } from "zod";
import { NonEmptyStringSchema } from "../validation/shared";

export const REQUIRED_CANONICAL_RECEIPT_TYPES = [
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
] as const;

export const REQUIRED_YOUTUBE_RECEIPT_TYPES = [
  "youtube_script_receipt.v1",
  "youtube_packaging_receipt.v1",
  "youtube_thumbnail_receipt.v1",
  "youtube_publish_package_receipt.v1",
  "youtube_analytics_receipt.v1",
] as const;

export const CanonicalDecisionSchema = z.enum(["approved", "rejected", "revise", "blocked"]);

export const CanonicalReceiptSchema = z.object({
  schema: NonEmptyStringSchema,
  receipt_id: NonEmptyStringSchema,
  created_at: NonEmptyStringSchema,
  agent_id: NonEmptyStringSchema,
  decision: CanonicalDecisionSchema,
  evidence_hash: NonEmptyStringSchema,
  blockers: z.array(NonEmptyStringSchema).default([]),
}).strict();

export const CanonicalOperationalPackageSchema = z.object({
  package_id: NonEmptyStringSchema,
  channel: NonEmptyStringSchema,
  created_at: NonEmptyStringSchema,
  receipts: z.array(CanonicalReceiptSchema),
  status: CanonicalDecisionSchema.optional(),
  blockers: z.array(NonEmptyStringSchema).optional(),
}).strict();

export type CanonicalReceipt = z.infer<typeof CanonicalReceiptSchema>;
export type CanonicalOperationalPackage = z.infer<typeof CanonicalOperationalPackageSchema>;

export interface CanonicalPackageEvaluation {
  readonly status: "approved" | "blocked";
  readonly blockers: readonly string[];
  readonly package: CanonicalOperationalPackage;
}

function hasApprovedReceipt(receipts: readonly CanonicalReceipt[], schema: string): boolean {
  return receipts.some((r) => r.schema === schema && r.decision === "approved" && r.blockers.length === 0);
}

function receiptBlockers(receipts: readonly CanonicalReceipt[]): string[] {
  return receipts
    .filter((r) => r.decision !== "approved" || r.blockers.length > 0)
    .map((r) => `receipt_rejected_${r.schema}`);
}

function missingReceiptBlockers(receipts: readonly CanonicalReceipt[], required: readonly string[]): string[] {
  return required.filter((schema) => !hasApprovedReceipt(receipts, schema)).map((schema) => `missing_${schema}`);
}

export function evaluateCanonicalOperationalPackage(input: Omit<CanonicalOperationalPackage, "status" | "blockers">): CanonicalPackageEvaluation {
  const parsed = CanonicalOperationalPackageSchema.omit({ status: true, blockers: true }).parse(input);
  const blockers = [...missingReceiptBlockers(parsed.receipts, REQUIRED_CANONICAL_RECEIPT_TYPES), ...receiptBlockers(parsed.receipts)];
  const status = blockers.length === 0 ? "approved" : "blocked";
  return { status, blockers, package: { ...parsed, status, blockers } };
}

export interface LearningEventInput {
  readonly event_type: string;
  readonly trigger: string;
  readonly affected_agents: readonly string[];
  readonly affected_channels: readonly string[];
  readonly observed_failure: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly evidence_paths: readonly string[];
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export function buildLearningEvent(input: LearningEventInput) {
  return {
    schema: "learning_event.v1" as const,
    receipt_id: `learning-event-${stableHash(input)}`,
    created_at: new Date().toISOString(),
    ...input,
    root_cause_hypothesis: "pending_review",
    requires_code_change: true,
    requires_policy_change: true,
  };
}

export interface LearningDeltaInput {
  readonly source_learning_event: string;
  readonly target_agent_or_flow: string;
  readonly proposed_update: string;
}

export function buildLearningDelta(input: LearningDeltaInput) {
  return {
    schema: "learning_delta.v1" as const,
    receipt_id: `learning-delta-${stableHash(input)}`,
    created_at: new Date().toISOString(),
    ...input,
    before_rule: "current_runtime",
    after_rule: input.proposed_update,
    expected_improvement: "better_runtime_quality",
    rollback_path: "docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json",
    approved_for_implementation: false,
  };
}

export function buildAgentPerformanceLedger(input: { agent_id: string; tasks_seen?: number; outputs_rejected?: number }) {
  const tasksSeen = input.tasks_seen ?? 0;
  const outputsRejected = input.outputs_rejected ?? 0;
  return {
    schema: "agent_performance_ledger.v1" as const,
    agent_id: input.agent_id,
    tasks_seen: tasksSeen,
    outputs_rejected: outputsRejected,
    current_status: tasksSeen === 0 ? "defined_not_operational" : outputsRejected > 0 ? "needs_upgrade" : "active",
  };
}

export interface YoutubeProductionPackageInput {
  readonly package_id: string;
  readonly created_at: string;
  readonly receipts: readonly CanonicalReceipt[];
}

export function buildYoutubeProductionPackage(input: YoutubeProductionPackageInput) {
  const blockers = [...missingReceiptBlockers(input.receipts, REQUIRED_YOUTUBE_RECEIPT_TYPES), ...receiptBlockers(input.receipts)];
  const status = blockers.length === 0 ? "approved" : "blocked";
  return {
    schema: "youtube_production_package.v1" as const,
    package_id: input.package_id,
    created_at: input.created_at,
    receipts: input.receipts,
    status,
    blockers,
  };
}
