import { createHash } from "node:crypto";
import type { ChannelHeadDecisionContext, RestrictedGate } from "./channel-head-context";
import type { ChannelHeadAction } from "./contracts";

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function idFor(prefix: string, parts: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

export function gateForRiskClass(riskClass: string, requiredGate: RestrictedGate | "NONE" | undefined): RestrictedGate | null {
  if (requiredGate && requiredGate !== "NONE") return requiredGate;
  switch (riskClass) {
    case "restricted_provider":
    case "restricted_db_deploy": return "PRODUCTION_GATE";
    case "restricted_financial": return "FINANCIAL_GATE";
    case "restricted_credentials": return "SECRET_GATE";
    case "restricted_outreach": return "SEND_GATE";
    case "public_claim_risk": return "PUBLISH_GATE";
    default: return null;
  }
}

export function joinedHash(context: ChannelHeadDecisionContext): string | null {
  return context.evidence.evidenceHash ?? context.qualitySignal.evidenceHash ?? context.mediaGate.evidenceHash ?? context.payloadHash;
}

export function actionFor(context: ChannelHeadDecisionContext, decisionId: string, actionType = context.targetActionType): ChannelHeadAction {
  const evidenceHash = joinedHash(context) ?? sha256(decisionId);
  return {
    schema_version: "callscore_channel_head_action.v1",
    action_id: idFor("action", [decisionId, actionType]),
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    action_type: actionType,
    risk_class: context.riskClass,
    dry_run: actionType !== "publish_owned_public",
    external_mutation_requested: actionType === "publish_owned_public",
    external_mutation_performed: false,
    restricted_gate_required: gateForRiskClass(context.riskClass, context.gtmRegistryState.requiredGate),
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    payload_hash: context.payloadHash ?? evidenceHash,
    evidence_hash: evidenceHash,
    idempotency_key: `${context.channelHeadSoul.agentId}:${actionType}:${context.taskId ?? decisionId}`,
    parent_receipt_ids: [...context.recentReceipts],
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    provider: null,
    provider_operation: null,
    reason: `Channel-head decision selected ${actionType}.`,
    metadata: { lane_id: context.gtmRegistryState.laneId, workplane_status: context.workplane.status, quality_score: context.qualitySignal.score },
  };
}

export function receiptStatus(decision: string): string {
  switch (decision) {
    case "act": return "succeeded";
    case "suppress": return "suppressed";
    case "escalate_non_founder_review": return "review";
    default: return "blocked";
  }
}

export function explanationFor(decision: string, blockers: readonly string[]): string {
  if (decision === "act") return "Safe owned-public action has complete evidence, media, originality, policy, and Workplane signals.";
  if (decision === "wait") return `Decision waits because cooldown or readiness blockers are active: ${blockers.join(", ")}.`;
  if (decision === "suppress") return `Decision suppressed because fail-closed quality/media/originality blockers are active: ${blockers.join(", ")}.`;
  if (decision === "request_gate") return `Restricted risk requires explicit gate evidence before action: ${blockers.join(", ")}.`;
  return `Ambiguous safe-owned-public item routed to non-founder review: ${blockers.join(", ")}.`;
}
