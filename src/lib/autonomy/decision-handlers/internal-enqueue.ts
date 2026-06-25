import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import type { GateResult } from "../decision-gates";
import { ChannelHeadDecisionSchema, AutonomyReceiptSchema } from "../contracts";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { idFor, addMinutes, joinedHash, actionFor, receiptStatus, explanationFor } from "../decision-helpers";
import { scoreChannelHeadCandidate } from "../channel-head-scoring";

/**
 * Internal-enqueue handler — lightweight system-health gates only.
 * Allows internal queue/job/task preparation. Never publishes, sends,
 * or externally mutates. Produces a `draft` action when gates pass.
 */
export function handleInternalEnqueue(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = checkEnqueueGates(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return makeEnqueueDecision(context);
}

function checkEnqueueGates(ctx: ChannelHeadDecisionContext): GateResult | null {
  if (ctx.killSwitch.global_active) return { decision: "wait", reason_codes: ["global_kill_switch_active"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.killSwitch.channel_active) return { decision: "wait", reason_codes: ["channel_kill_switch_active"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.killSwitch.agent_paused) return { decision: "wait", reason_codes: ["agent_paused"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait", reason_codes: ["heartbeat_missing"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.fresh) return { decision: "wait", reason_codes: ["heartbeat_stale"], wait_until: addMinutes(ctx.now, 15) };
  if (!ctx.heartbeat.lease_expires_at) return { decision: "wait", reason_codes: ["heartbeat_lease_missing"], wait_until: addMinutes(ctx.now, 15) };
  if (new Date(ctx.heartbeat.lease_expires_at).getTime() <= new Date(ctx.now).getTime()) return { decision: "wait", reason_codes: ["heartbeat_lease_expired"], wait_until: addMinutes(ctx.now, 15) };
  if (ctx.workplane.status === "BLOCKED") return { decision: "wait", reason_codes: ["workplane_blocked"], wait_until: addMinutes(ctx.now, 15) };
  return null;
}

function makeEnqueueDecision(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const score = scoreChannelHeadCandidate(context);
  const decisionId = idFor("decision", [context.now, context.taskId, context.channelHeadSoul.agentId, context.payloadHash, context.riskClass, context.targetActionType]);
  const receiptId = idFor("receipt", [decisionId, context.channelHeadSoul.agentId]);
  const inputSnapshotId = idFor("snapshot", [context.now, context.channelHeadSoul.agentId, context.gtmRegistryState.laneId]);
  const nextWakeAt = context.cooldown.waitUntil ?? addMinutes(context.now, 60);

  const proposedAction = actionFor(context, decisionId, "draft");
  const reasonCodes = ["internal_enqueue_clear", ...score.reason_codes];

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
    explanation: "Internal enqueue gates passed — draft queued.",
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
      target_action_type: "draft",
      restricted_lanes_fail_closed: true,
    },
  });

  return { input: context, decision, receipt };
}
