import { createHash } from "node:crypto";
import { z } from "zod";
import { NonEmptyStringSchema } from "../validation/shared";
import { validateCanonicalMediaArtifact, type MediaArtifactReceipt } from "../agent-toolbox-contract";
import { loadCanonicalAgentIds } from "../canonical-agent-registry";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const MAX_PACKAGE_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export const REQUIRED_CANONICAL_RECEIPT_TYPES = [
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
  "callscore.task_router_receipt.v1",
  "callscore.tool_inheritance_receipt.v1",
  "callscore.design_bundle_reference_receipt.v1",
  "callscore.website_design_alignment_receipt.v2",
  "callscore.branding_receipt.v2",
  "callscore.brand_lockup_occlusion_check.v1",
  "callscore.media_artifact_receipt.v2",
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
  created_at: z.string().datetime({ offset: true }),
  agent_id: NonEmptyStringSchema,
  decision: CanonicalDecisionSchema,
  evidence_hash: Sha256Schema,
  blockers: z.array(NonEmptyStringSchema).default([]),
}).strict();

export const CanonicalOperationalPackageSchema = z.object({
  package_id: NonEmptyStringSchema,
  channel: NonEmptyStringSchema,
  created_at: z.string().datetime({ offset: true }),
  approved_payload_hash: Sha256Schema,
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

export interface CanonicalOperationalPackageInput extends Omit<CanonicalOperationalPackage, "status" | "blockers"> {
  readonly media_artifact?: Partial<MediaArtifactReceipt> | null;
  readonly evaluation_now?: string | Date;
  readonly expected_channel?: string;
  readonly expected_payload_hash?: string;
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

let canonicalAgentIds: ReadonlySet<string> | null = null;

function canonicalAgents(): ReadonlySet<string> {
  canonicalAgentIds ??= new Set(loadCanonicalAgentIds());
  return canonicalAgentIds;
}

function platformOwners(channel: string): { head: string; posting: string; media: string } | null {
  if (channel === "x") return { head: "callscore-x-head", posting: "callscore-x-posting-agent", media: "callscore-x-image-agent" };
  if (channel === "linkedin") return { head: "callscore-linkedin-head", posting: "callscore-linkedin-posting-agent", media: "callscore-linkedin-image-agent" };
  if (channel === "reddit") return { head: "callscore-reddit-head", posting: "callscore-reddit-posting-agent", media: "callscore-reddit-image-agent" };
  if (channel === "youtube") return { head: "callscore-youtube-head", posting: "callscore-youtube-publishing-agent", media: "callscore-youtube-thumbnail-agent" };
  return null;
}

function receiptOwnerAllowed(receipt: CanonicalReceipt, channel: string): boolean {
  if (!canonicalAgents().has(receipt.agent_id)) return false;
  const platform = platformOwners(channel);
  if (!platform) return false;
  if (["callscore.task_router_receipt.v1", "callscore.tool_inheritance_receipt.v1"].includes(receipt.schema)) {
    return receipt.agent_id === "callscore-orchestrator-head";
  }
  if (receipt.schema === "editorial_angle_receipt.v1") {
    return ["callscore-cmo-head", "callscore-artofwar-strategist"].includes(receipt.agent_id);
  }
  if (receipt.schema === "platform_fit_receipt.v1") {
    return [platform.head, platform.posting].includes(receipt.agent_id);
  }
  if (receipt.schema === "same_shit_memory_receipt.v1") {
    return ["callscore-cmo-head", "callscore-reviewer-head"].includes(receipt.agent_id);
  }
  return [platform.media, platform.head, "callscore-reviewer-head", "callscore-safety-head", "callscore-trust-head"].includes(receipt.agent_id);
}

function timestampBlockers(label: string, timestamp: string, nowMs: number): string[] {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) return [`${label}_timestamp_invalid`];
  if (value > nowMs + MAX_FUTURE_SKEW_MS) return [`${label}_future_dated`];
  if (nowMs - value > MAX_PACKAGE_AGE_MS) return [`${label}_stale`];
  return [];
}

export function evaluateCanonicalOperationalPackage(input: CanonicalOperationalPackageInput): CanonicalPackageEvaluation {
  const {
    media_artifact: mediaArtifact,
    evaluation_now: evaluationNow,
    expected_channel: expectedChannel,
    expected_payload_hash: expectedPayloadHash,
    ...packageInput
  } = input;
  const parsed = CanonicalOperationalPackageSchema.omit({ status: true, blockers: true }).parse(packageInput);
  const nowMs = evaluationNow instanceof Date ? evaluationNow.getTime() : Date.parse(evaluationNow ?? new Date().toISOString());
  const mediaBlockers: string[] = [];
  if (!mediaArtifact) {
    mediaBlockers.push("missing_canonical_media_artifact");
  } else if (mediaArtifact.schema !== "callscore.media_artifact_receipt.v2") {
    mediaBlockers.push("canonical_media_receipt_v2_required");
  } else {
    const mediaValidation = validateCanonicalMediaArtifact(mediaArtifact);
    if (!mediaValidation.canonical_media_valid || !mediaValidation.publish_candidate_ready) {
      mediaBlockers.push(...mediaValidation.failure_reasons.map((reason) => `canonical_media_${reason}`));
    }
  }
  const blockers = [
    ...missingReceiptBlockers(parsed.receipts, REQUIRED_CANONICAL_RECEIPT_TYPES),
    ...receiptBlockers(parsed.receipts),
    ...timestampBlockers("canonical_package", parsed.created_at, nowMs),
    ...parsed.receipts.flatMap((receipt) => timestampBlockers(`receipt_${receipt.schema}`, receipt.created_at, nowMs)),
    ...parsed.receipts.filter((receipt) => !receiptOwnerAllowed(receipt, parsed.channel)).map((receipt) => `receipt_wrong_owner_${receipt.schema}`),
    ...(expectedChannel && parsed.channel !== expectedChannel ? ["canonical_package_channel_mismatch"] : []),
    ...(expectedPayloadHash && parsed.approved_payload_hash !== expectedPayloadHash ? ["canonical_package_payload_hash_mismatch"] : []),
    ...mediaBlockers,
  ];
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
  readonly approved_payload_hash: string;
  readonly receipts: readonly CanonicalReceipt[];
  readonly media_artifact?: Partial<MediaArtifactReceipt> | null;
}

export function buildYoutubeProductionPackage(input: YoutubeProductionPackageInput) {
  const base = evaluateCanonicalOperationalPackage({
    package_id: input.package_id,
    channel: "youtube",
    created_at: input.created_at,
    approved_payload_hash: input.approved_payload_hash,
    receipts: [...input.receipts],
    media_artifact: input.media_artifact,
  });
  const blockers = [
    ...base.blockers,
    ...missingReceiptBlockers(input.receipts, REQUIRED_YOUTUBE_RECEIPT_TYPES),
  ];
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
