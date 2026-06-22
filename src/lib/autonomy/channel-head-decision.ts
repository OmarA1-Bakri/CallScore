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

function suppressionBlockers(context: ChannelHeadDecisionContext): string[] {
  const blockers: string[] = [];
  if (context.qualitySignal.status === "fail" || context.qualitySignal.score < 0.5) blockers.push("quality_signal_failed");
  if (context.targetActionType === "publish_owned_public") {
    if (context.gtmRegistryState.currentStatus !== "ready_public_owned") blockers.push("registry_not_ready");
    if (!context.gtmRegistryState.ownedOrManaged) blockers.push("not_owned_or_managed", "registry_not_owned_or_managed");
    if (!context.gtmRegistryState.zeroSpendRequired) blockers.push("non_zero_spend");
    if (!context.gtmRegistryState.allowedActions.includes(context.targetActionType)) blockers.push("action_not_allowed", "target_action_not_allowed");
    if (context.gtmRegistryState.forbiddenActions.includes(context.targetActionType)) blockers.push("action_forbidden", "target_action_forbidden");
    if (!context.channelPolicy.safeOwnedPublicAllowed) blockers.push("policy_disallows_safe_owned_public", "safe_owned_public_policy_disabled");
    if (context.mediaGate.status === "missing") blockers.push("media_gate_missing");
    else if (context.mediaGate.status === "fail") blockers.push("media_gate_failed");
    if (context.originalityGate.status === "fail") blockers.push("originality_gate_failed");
    else if (context.originalityGate.status === "missing") blockers.push("originality_gate_missing");
  }
  if (context.evidence.evidenceLevel === "E0" || !context.evidence.evidenceHash || context.evidence.sourceArtifactIds.length === 0) blockers.push("missing_evidence_hash", "evidence_incomplete");
  if (!context.channelPolicy.claimBearingAllowed) blockers.push("claim_bearing_not_allowed");
  if (!context.channelPolicy.publicClaimsSupported) blockers.push("public_claims_not_supported");
  if (context.caps.channelPostsToday >= context.caps.maxChannelPostsPerDay) blockers.push("channel_daily_cap_reached");
  if (context.caps.totalPostsToday >= context.caps.maxTotalPostsPerDay) blockers.push("global_daily_cap_reached");
  return [...new Set(blockers)];
}

function reviewBlockers(context: ChannelHeadDecisionContext): string[] {
  const blockers: string[] = [];
  if (context.qualitySignal.status === "ambiguous" || context.qualitySignal.status === "unknown") blockers.push("quality_signal_ambiguous");
  if (context.qualitySignal.score < context.channelPolicy.requiresNonFounderReviewBelowConfidence) blockers.push("confidence_below_non_founder_review_threshold");
  if (context.mediaGate.status === "unknown") blockers.push("media_gate_unknown");
  if (context.originalityGate.status === "unknown") blockers.push("originality_gate_unknown");
  if (context.workplane.status === "WARN" || context.workplane.status === "UNKNOWN") blockers.push("workplane_not_fully_ok");
  return [...new Set(blockers)];
}

function preflightWaitBlockers(context: ChannelHeadDecisionContext): string[] {
  const blockers: string[] = [];
  if (context.killSwitch.global_active) blockers.push("global_kill_switch_active");
  if (context.killSwitch.channel_active) blockers.push("channel_kill_switch_active");
  if (context.killSwitch.agent_paused) blockers.push("agent_paused");
  if (!context.heartbeat.heartbeat_id) blockers.push("heartbeat_missing");
  else if (!context.heartbeat.fresh) blockers.push("heartbeat_stale");
  if (!context.heartbeat.lease_expires_at) blockers.push("heartbeat_lease_missing");
  else if (new Date(context.heartbeat.lease_expires_at).getTime() <= new Date(context.now).getTime()) blockers.push("heartbeat_lease_expired");
  return [...new Set(blockers)];
}

function publicVerifyBlockers(context: ChannelHeadDecisionContext): string[] {
  if (context.publicVerify.status === "fail") return ["public_verify_failed"];
  if (context.publicVerify.status === "unknown") return ["public_verify_unknown"];
  if (!context.publicVerify.checked_at) return ["public_verify_missing_checked_at"];
  return [];
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

export function decideChannelHeadAction(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const cooldowns = cooldownBlockers(context);
  const score = scoreChannelHeadCandidate(context);
  const decisionId = idFor("decision", [context.now, context.taskId, context.channelHeadSoul.agentId, context.payloadHash, context.riskClass, context.targetActionType]);
  const receiptId = idFor("receipt", [decisionId, context.channelHeadSoul.agentId]);
  const inputSnapshotId = idFor("snapshot", [context.now, context.channelHeadSoul.agentId, context.gtmRegistryState.laneId]);
  const nextWakeAt = context.cooldown.waitUntil ?? addMinutes(context.now, 60);

  let decision: ChannelHeadDecision["decision"] = "act";
  let blockers: string[] = [];
  let reasonCodes: string[] = ["safe_owned_public_evidence_complete", ...score.reason_codes];
  let proposedAction: ChannelHeadAction | null = null;
  let nonFounderReviewRequired = false;
  let waitUntil: string | null = null;
  let suppressUntil: string | null = null;
  const waitPreflightBlockers = preflightWaitBlockers(context);
  const suppressPreflightBlockers = publicVerifyBlockers(context);

  if (waitPreflightBlockers.length > 0) {
    decision = "wait";
    blockers = waitPreflightBlockers;
    reasonCodes = waitPreflightBlockers;
    waitUntil = addMinutes(context.now, 15);
  } else if (suppressPreflightBlockers.length > 0) {
    decision = "suppress";
    blockers = suppressPreflightBlockers;
    reasonCodes = suppressPreflightBlockers;
    suppressUntil = addMinutes(context.now, 24 * 60);
  } else if (score.decision === "wait") {
    decision = "wait";
    blockers = [...cooldowns, ...context.workplane.blockers, ...(context.workplane.status === "BLOCKED" ? ["workplane_blocked"] : [])];
    reasonCodes = blockers.length ? blockers : ["cooldown_active", ...score.reason_codes];
    waitUntil = context.cooldown.waitUntil ?? addMinutes(context.now, 60);
  } else if (score.decision === "request_gate") {
    decision = "request_gate";
    blockers = [...score.reason_codes];
    reasonCodes = [...score.reason_codes, "restricted_risk_requires_gate"];
  } else if (score.decision === "suppress") {
    decision = "suppress";
    blockers = [...score.reason_codes];
    reasonCodes = [...score.reason_codes];
    suppressUntil = addMinutes(context.now, 24 * 60);
  } else if (score.decision === "review") {
    decision = "escalate_non_founder_review";
    blockers = [...score.reason_codes];
    reasonCodes = [...score.reason_codes];
    nonFounderReviewRequired = true;
    proposedAction = actionFor(context, decisionId, "create_non_founder_review_item");
  } else {
    proposedAction = actionFor(context, decisionId);
  }

  const receiptPath = `.tmp/workflow-receipts/channel_head_decisions/${receiptId}.json`;
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
    reason_codes: [...new Set(reasonCodes)],
    explanation: explanationFor(decision, blockers),
    proposed_action: proposedAction,
    gate_required: decision === "request_gate" ? score.gate_required : null,
    gate_receipt_id: context.gtmRegistryState.requiredReceipt ?? null,
    non_founder_review_required: nonFounderReviewRequired,
    suppress_until: suppressUntil,
    wait_until: waitUntil,
    blockers: [...new Set(blockers)],
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
    artifact_path: receiptPath,
    rollback_path: context.gtmRegistryState.rollbackPath ?? null,
    summary: explanationFor(parsedDecision.decision, blockers),
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
