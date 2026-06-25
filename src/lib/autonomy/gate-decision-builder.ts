import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecisionResult } from "./channel-head-decision";
import type { ChannelHeadDecision, AutonomyReceipt, ChannelHeadAction } from "./contracts";
import type { GateResult } from "./decision-gates";
import { scoreChannelHeadCandidate } from "./channel-head-scoring";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "./contracts";
import { idFor, addMinutes, joinedHash, actionFor, receiptStatus, explanationFor } from "./decision-helpers";

/**
 * Build a complete ChannelHeadDecisionResult from a gate result.
 * Used when a gate short-circuits the normal flow before scoring
 * (e.g., wait for cooldown, suppress for evidence failure, request_gate for risk class).
 */
export function makeDecisionFromGates(context: ChannelHeadDecisionContext, gate: GateResult): ChannelHeadDecisionResult {
  const score = scoreChannelHeadCandidate(context);
  const decisionId = idFor("decision", [context.now, context.taskId, context.channelHeadSoul.agentId, context.payloadHash, context.riskClass, context.targetActionType]);
  const receiptId = idFor("receipt", [decisionId, context.channelHeadSoul.agentId]);
  const inputSnapshotId = idFor("snapshot", [context.now, context.channelHeadSoul.agentId, context.gtmRegistryState.laneId]);
  const nextWakeAt = context.cooldown.waitUntil ?? addMinutes(context.now, 60);

  let proposedAction: ChannelHeadAction | null = null;
  let nonFounderReviewRequired = false;
  const gatedDecision = gate.decision === "review" ? "escalate_non_founder_review" as const : gate.decision as ChannelHeadDecision["decision"];

  if (gate.decision === "escalate_non_founder_review" || gate.decision === "review") {
    nonFounderReviewRequired = true;
    proposedAction = actionFor(context, decisionId, "create_non_founder_review_item");
  }

  const decision: ChannelHeadDecision = ChannelHeadDecisionSchema.parse({
    schema_version: "callscore_channel_head_decision.v1",
    decision_id: decisionId,
    created_at: context.now,
    agent_id: context.channelHeadSoul.agentId,
    channel_id: context.channelHeadSoul.channelId,
    task_id: context.taskId,
    input_snapshot_id: inputSnapshotId,
    risk_class: context.riskClass,
    decision: gatedDecision,
    confidence: Math.max(0, Math.min(1, score.total_score)),
    reason_codes: [...new Set([...gate.reason_codes, ...score.reason_codes])],
    explanation: explanationFor(gatedDecision, gate.reason_codes),
    proposed_action: proposedAction,
    gate_required: gate.gate_required ?? null,
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    non_founder_review_required: nonFounderReviewRequired,
    suppress_until: gate.suppress_until ?? null,
    wait_until: gate.wait_until ?? null,
    blockers: [...new Set(gate.reason_codes)],
    receipts_to_write: [receiptId],
    next_wake_at: nextWakeAt,
  });

  const receipt: AutonomyReceipt = AutonomyReceiptSchema.parse({
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
    dry_run: decision.decision !== "act",
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
    summary: explanationFor(decision.decision, gate.reason_codes),
    detail: {
      decision_id: decision.decision_id,
      input_snapshot_id: decision.input_snapshot_id,
      reason_codes: decision.reason_codes,
      target_action_type: context.targetActionType,
      restricted_lanes_fail_closed: true,
    },
  });

  return { input: context, decision, receipt };
}
