import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import type { GateResult } from "../decision-gates";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "../contracts";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { idFor, addMinutes, joinedHash, actionFor, receiptStatus, explanationFor } from "../decision-helpers";
import { scoreChannelHeadCandidate } from "../channel-head-scoring";
import { checkKillSwitchAndHeartbeat } from "../decision-gates";

/**
 * Gated-external-send handler — never sends directly. Produces approval-packet
 * decisions only. Requires explicit gate evidence (SEND_GATE receipt) before
 * any send-capable mutation. Missing approval/gate evidence produces
 * request_gate or escalation, not act.
 *
 * Applies to email, partnership, Reddit gated send, Whop/commercial gated
 * flows, or any future external-send lane.
 */
export function handleGatedExternalSend(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = checkGatedSendGates(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return makeApprovalPacketDecision(context);
}

function checkGatedSendGates(ctx: ChannelHeadDecisionContext): GateResult | null {
  // System health gates
  const systemGate = checkKillSwitchAndHeartbeat(ctx);
  if (systemGate) return systemGate;

  // Workplane blocked check
  if (ctx.workplane.status === "BLOCKED") return { decision: "wait", reason_codes: ["workplane_blocked"], wait_until: addMinutes(ctx.now, 15) };

  // Cooldown check — if any cooldown active, wait
  if (ctx.cooldown.channelCooldownActive) return { decision: "wait", reason_codes: ["channel_cooldown_active"], wait_until: ctx.cooldown.waitUntil ?? addMinutes(ctx.now, 60) };
  if (ctx.cooldown.providerErrorCooldownActive) return { decision: "wait", reason_codes: ["provider_error_cooldown_active"], wait_until: addMinutes(ctx.now, 60) };

  // Send gate evidence check — required gate must have a receipt
  if (ctx.gtmRegistryState.requiredGate !== "NONE" && !ctx.gtmRegistryState.requiredReceipt) {
    return {
      decision: "request_gate",
      reason_codes: ["send_gate_missing", `required_gate:${ctx.gtmRegistryState.requiredGate}`],
      gate_required: ctx.gtmRegistryState.requiredGate,
    };
  }

  // Restricted outreach without evidence
  if (ctx.riskClass === "restricted_outreach") {
    const hasEvidence = ctx.evidence.evidenceHash && ctx.evidence.evidenceLevel >= "E1";
    if (!hasEvidence) {
      return {
        decision: "request_gate",
        reason_codes: ["restricted_outreach_missing_evidence", "send_gate_required"],
        gate_required: "SEND_GATE",
      };
    }
  }

  // Evidence minimum for any external send preparation
  if (!ctx.evidence.evidenceHash) {
    return { decision: "suppress", reason_codes: ["gated_send_missing_evidence"], suppress_until: undefined };
  }

  return null;
}

function makeApprovalPacketDecision(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const score = scoreChannelHeadCandidate(context);
  const decisionId = idFor("decision", [context.now, context.taskId, context.channelHeadSoul.agentId, context.payloadHash, context.riskClass, context.targetActionType]);
  const receiptId = idFor("receipt", [decisionId, context.channelHeadSoul.agentId]);
  const inputSnapshotId = idFor("snapshot", [context.now, context.channelHeadSoul.agentId, context.gtmRegistryState.laneId]);
  const nextWakeAt = context.cooldown.waitUntil ?? addMinutes(context.now, 60);

  // Always produce an approval-packet action, never a live send action
  const proposedAction = actionFor(context, decisionId, "create_approval_packet");
  const reasonCodes = ["gated_send_gates_clear", "approval_packet_only", ...score.reason_codes];

  const decision = ChannelHeadDecisionSchema.parse({
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
    reason_codes: reasonCodes,
    explanation: "Gated send gates passed — approval packet created. Live send requires explicit gate approval.",
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

  const receipt = AutonomyReceiptSchema.parse({
    schema_version: "callscore_autonomy_receipt.v1",
    receipt_id: receiptId,
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    run_id: null,
    task_id: context.taskId,
    receipt_type: "decision",
    status: receiptStatus(decision.decision),
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
    gate_required: decision.gate_required,
    gate_receipt_id: decision.gate_receipt_id,
    idempotency_key: receiptId,
    parent_receipt_ids: [...context.recentReceipts],
    artifact_path: `.tmp/workflow-receipts/channel_head_decisions/${receiptId}.json`,
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    summary: explanationFor(decision.decision, []),
    detail: {
      decision_id: decision.decision_id,
      input_snapshot_id: decision.input_snapshot_id,
      reason_codes: decision.reason_codes,
      target_action_type: "create_approval_packet",
      restricted_lanes_fail_closed: true,
    },
  });

  return { input: context, decision, receipt };
}
