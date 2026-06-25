import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  AutonomyReceiptSchema,
  ChannelHeadDecisionSchema,
  type AutonomyReceipt,
  type ChannelHeadAction,
  type ChannelHeadDecision,
} from "./contracts";
import type { ChannelHeadDecisionContext, RestrictedGate } from "./channel-head-context";
import { scoreChannelHeadCandidate } from "./channel-head-scoring";
import { evaluateGates } from "./decision-gates";

export type { ChannelHeadDecisionContext } from "./channel-head-context";

export interface ChannelHeadDecisionResult {
  readonly input: ChannelHeadDecisionContext;
  readonly decision: ChannelHeadDecision;
  readonly receipt: AutonomyReceipt;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function idFor(prefix: string, parts: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function isRestrictedRisk(riskClass: string): boolean {
  return riskClass.startsWith("restricted_") || riskClass === "public_claim_risk";
}

function gateFor(context: ChannelHeadDecisionContext): RestrictedGate | null {
  if (context.gtmRegistryState.requiredGate !== "NONE") return context.gtmRegistryState.requiredGate;
  switch (context.riskClass) {
    case "restricted_provider":
    case "restricted_db_deploy":
      return "PRODUCTION_GATE";
    case "restricted_financial":
      return "FINANCIAL_GATE";
    case "restricted_credentials":
      return "SECRET_GATE";
    case "restricted_outreach":
      return "SEND_GATE";
    case "public_claim_risk":
      return "PUBLISH_GATE";
    default:
      return null;
  }
}

function joinedHash(context: ChannelHeadDecisionContext): string | null {
  return context.evidence.evidenceHash ?? context.qualitySignal.evidenceHash ?? context.mediaGate.evidenceHash ?? context.payloadHash;
}

function cooldownBlockers(context: ChannelHeadDecisionContext): string[] {
  const blockers: string[] = [];
  if (context.cooldown.channelCooldownActive) blockers.push("channel_cooldown_active");
  if (context.cooldown.providerErrorCooldownActive) blockers.push("provider_error_cooldown_active");
  if (context.cooldown.duplicatePayloadCooldownActive) blockers.push("duplicate_payload_cooldown_active");
  return blockers;
}

function actionFor(context: ChannelHeadDecisionContext, decisionId: string, actionType = context.targetActionType): ChannelHeadAction {
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
    restricted_gate_required: gateFor(context),
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    payload_hash: context.payloadHash ?? evidenceHash,
    evidence_hash: evidenceHash,
    idempotency_key: `${context.channelHeadSoul.agentId}:${actionType}:${context.taskId ?? decisionId}`,
    parent_receipt_ids: [...context.recentReceipts],
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    provider: null,
    provider_operation: null,
    reason: `Channel-head decision selected ${actionType}.`,
    metadata: {
      lane_id: context.gtmRegistryState.laneId,
      workplane_status: context.workplane.status,
      quality_score: context.qualitySignal.score,
    },
  };
}

function receiptStatus(decision: ChannelHeadDecision["decision"]): AutonomyReceipt["status"] {
  switch (decision) {
    case "act":
      return "succeeded";
    case "suppress":
      return "suppressed";
    case "escalate_non_founder_review":
      return "review";
    default:
      return "blocked";
  }
}

function explanationFor(decision: ChannelHeadDecision["decision"], blockers: readonly string[]): string {
  if (decision === "act") return "Safe owned-public action has complete evidence, media, originality, policy, and Workplane signals.";
  if (decision === "wait") return `Decision waits because cooldown or readiness blockers are active: ${blockers.join(", ")}.`;
  if (decision === "suppress") return `Decision suppressed because fail-closed quality/media/originality blockers are active: ${blockers.join(", ")}.`;
  if (decision === "request_gate") return `Restricted risk requires explicit gate evidence before action: ${blockers.join(", ")}.`;
  return `Ambiguous safe-owned-public item routed to non-founder review: ${blockers.join(", ")}.`;
}

function coerceGateDecision(gateDecision: string): ChannelHeadDecision["decision"] {
  // Legacy mapping — gate decision values map 1:1 except "review" → "escalate_non_founder_review"
  if (gateDecision === "review") return "escalate_non_founder_review";
  return gateDecision as ChannelHeadDecision["decision"];
}

export function decideChannelHeadAction(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const score = scoreChannelHeadCandidate(context);
  const decisionId = idFor("decision", [context.now, context.taskId, context.channelHeadSoul.agentId, context.payloadHash, context.riskClass, context.targetActionType]);
  const receiptId = idFor("receipt", [decisionId, context.channelHeadSoul.agentId]);
  const inputSnapshotId = idFor("snapshot", [context.now, context.channelHeadSoul.agentId, context.gtmRegistryState.laneId]);
  const nextWakeAt = context.cooldown.waitUntil ?? addMinutes(context.now, 60);

  // Phase 1: Run the extracted gate chain (priority-ordered)
  const gateResult = evaluateGates(context);

  if (gateResult) {
    const decision = coerceGateDecision(gateResult.decision);
    const reasonCodes = [...new Set([...gateResult.reason_codes, ...score.reason_codes])];
    let proposedAction: ChannelHeadAction | null = null;
    let nonFounderReviewRequired = false;

    if (gateResult.decision === "escalate_non_founder_review") {
      nonFounderReviewRequired = true;
      proposedAction = actionFor(context, decisionId, "create_non_founder_review_item");
    }

    const parsedDecision = ChannelHeadDecisionSchema.parse({
      schema_version: "callscore_channel_head_decision.v1",
      decision_id: decisionId,
      created_at: context.now,
      agent_id: context.channelHeadSoul.agentId,
      channel_id: context.channelHeadSoul.channelId,
      task_id: context.taskId,
      input_snapshot_id: inputSnapshotId,
      risk_class: context.riskClass,
      decision,
      confidence: Math.max(0, Math.min(1, score.total_score)),
      reason_codes: reasonCodes,
      explanation: explanationFor(decision, gateResult.reason_codes),
      proposed_action: proposedAction,
      gate_required: gateResult.gate_required ?? null,
      gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
      non_founder_review_required: nonFounderReviewRequired,
      suppress_until: gateResult.suppress_until ?? null,
      wait_until: gateResult.wait_until ?? null,
      blockers: [...new Set(gateResult.reason_codes)],
      receipts_to_write: [receiptId],
      next_wake_at: nextWakeAt,
    });

    const parsedReceipt = AutonomyReceiptSchema.parse({
      schema_version: "callscore_autonomy_receipt.v1",
      receipt_id: receiptId,
      created_at: context.now,
      agent_id: context.channelHeadSoul.agentId,
      channel_id: context.channelHeadSoul.channelId,
      run_id: null,
      task_id: context.taskId,
      receipt_type: "decision",
      status: receiptStatus(parsedDecision.decision),
      risk_class: context.riskClass,
      payload_hash: context.payloadHash,
      evidence_hash: joinedHash(context),
      policy_version: context.channelPolicy.policyVersion,
      soul_version: context.channelHeadSoul.soulVersion,
      dry_run: parsedDecision.decision !== "act",
      external_mutation_performed: false,
      provider_mutation_performed: false,
      whop_mutation_performed: false,
      production_mutation_performed: false,
      send_or_outreach_performed: false,
      gate_required: parsedDecision.gate_required,
      gate_receipt_id: parsedDecision.gate_receipt_id,
      idempotency_key: receiptId,
      parent_receipt_ids: [...context.recentReceipts],
      artifact_path: `.tmp/workflow-receipts/channel_head_decisions/${receiptId}.json`,
      rollback_path: context.gtmRegistryState.rollbackPath ?? null,
      summary: explanationFor(parsedDecision.decision, gateResult.reason_codes),
      detail: {
        decision_id: parsedDecision.decision_id,
        input_snapshot_id: parsedDecision.input_snapshot_id,
        reason_codes: parsedDecision.reason_codes,
        target_action_type: context.targetActionType,
        restricted_lanes_fail_closed: true,
      },
    });

    return { input: context, decision: parsedDecision, receipt: parsedReceipt };
  }

  // Phase 2: All gates pass — propose action
  const proposedAction = actionFor(context, decisionId);
  const proposalReasonCodes = [...new Set(["safe_owned_public_evidence_complete", ...score.reason_codes])];

  const parsedDecision = ChannelHeadDecisionSchema.parse({
    schema_version: "callscore_channel_head_decision.v1",
    decision_id: decisionId,
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    task_id: context.taskId,
    input_snapshot_id: inputSnapshotId,
    risk_class: context.riskClass,
    decision: "act",
    confidence: Math.max(0, Math.min(1, score.total_score)),
    reason_codes: proposalReasonCodes,
    explanation: explanationFor("act", []),
    proposed_action: proposedAction,
    gate_required: null,
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    non_founder_review_required: false,
    suppress_until: null,
    wait_until: null,
    blockers: [],
    receipts_to_write: [receiptId],
    next_wake_at: nextWakeAt,
  });

  const parsedReceipt = AutonomyReceiptSchema.parse({
    schema_version: "callscore_autonomy_receipt.v1",
    receipt_id: receiptId,
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    run_id: null,
    task_id: context.taskId,
    receipt_type: "decision",
    status: "succeeded",
    risk_class: context.riskClass,
    payload_hash: context.payloadHash,
    evidence_hash: joinedHash(context),
    policy_version: context.channelPolicy.policyVersion,
    soul_version: context.channelHeadSoul.soulVersion,
    dry_run: true,
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    send_or_outreach_performed: false,
    gate_required: null,
    gate_receipt_id: null,
    idempotency_key: receiptId,
    parent_receipt_ids: [...context.recentReceipts],
    artifact_path: `.tmp/workflow-receipts/channel_head_decisions/${receiptId}.json`,
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    summary: "Safe owned-public action has complete evidence, media, originality, policy, and Workplane signals.",
    detail: {
      decision_id: parsedDecision.decision_id,
      input_snapshot_id: parsedDecision.input_snapshot_id,
      reason_codes: parsedDecision.reason_codes,
      target_action_type: context.targetActionType,
      restricted_lanes_fail_closed: true,
    },
  });

  return { input: context, decision: parsedDecision, receipt: parsedReceipt };
}

export function writeChannelHeadDecisionReceipt(result: ChannelHeadDecisionResult, receiptDir = ".tmp/workflow-receipts/channel_head_decisions"): string {
  const path = join(receiptDir, `${result.receipt.created_at.replace(/[:.]/g, "-")}-${result.receipt.receipt_id}.json`);
  const receipt = AutonomyReceiptSchema.parse({ ...result.receipt, artifact_path: path });
  const payload = {
    schema_version: "callscore_channel_head_decision_receipt.v1",
    created_at: receipt.created_at,
    decision: result.decision,
    receipt,
    input_summary: {
      agent_id: result.input.channelHeadSoul.agentId,
      channel_id: result.input.channelHeadSoul.channelId,
      lane_id: result.input.gtmRegistryState.laneId,
      workplane_status: result.input.workplane.status,
      risk_class: result.input.riskClass,
    },
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    send_or_outreach_performed: false,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return path;
}
