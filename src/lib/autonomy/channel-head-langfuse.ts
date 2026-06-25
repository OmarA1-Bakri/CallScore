/**
 * Langfuse instrumentation for channel head decisions.
 *
 * Wraps the full decision lifecycle in a Langfuse trace:
 *
 * Trace: channel-head-lifecycle/{agent_id}
 *   ├─ Span: input_snapshot         — records the input context
 *   ├─ Span: scoring                — dimension scores + risk class
 *   ├─ Span: decision               — the decision output
 *   ├─ Span: receipt                — the autonomy receipt
 *   └─ Span: state_transition       — state machine transition
 *
 * Uses the Langfuse TS SDK. Falls back gracefully if not configured.
 */
import { Langfuse } from "langfuse";
import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecision, AutonomyReceipt } from "./contracts";
import type { ChannelHeadState, ChannelHeadStateData, StateTransition } from "./channel-head-state-machine";

// ── Langfuse client (lazy singleton) ────────────────────────

interface LangfuseConfig {
  secretKey: string;
  publicKey: string;
  baseUrl: string;
}

let _client: Langfuse | null = null;
let _config: LangfuseConfig | null = null;

function getClient(): Langfuse | null {
  if (_client) return _client;

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_HOST || "http://localhost:3000";

  if (!secretKey || !publicKey) {
    return null;  // Not configured — don't crash
  }

  _config = { secretKey, publicKey, baseUrl };
  _client = new Langfuse({
    secretKey,
    publicKey,
    baseUrl,
  });

  return _client;
}

/** Check if Langfuse is configured. */
export function langfuseConfigured(): boolean {
  return getClient() !== null;
}

// ── Trace lifecycle ─────────────────────────────────────────

/**
 * Create a trace for a channel head decision lifecycle.
 *
 * The trace spans the full lifecycle: input snapshot → decision → state transition.
 * Returns the trace ID for subsequent span attachment.
 */
export function createDecisionTrace(
  agentId: string,
  channelId: string,
  traceName?: string,
): string | null {
  const client = getClient();
  if (!client) return null;

  const trace = client.trace({
    name: traceName ?? `channel-head-lifecycle/${agentId}`,
    tags: ["channel_head", agentId, channelId],
    metadata: {
      agent_id: agentId,
      channel_id: channelId,
      source: "channel-head-state-machine",
    },
  });

  return trace.id;
}

/**
 * Record the input snapshot as a span on the trace.
 */
export function traceInputSnapshot(
  traceId: string,
  context: ChannelHeadDecisionContext,
): void {
  const client = getClient();
  if (!client) return;

  client.span({
    traceId,
    name: "input_snapshot",
    input: {
      now: context.now,
      task_id: context.taskId,
      agent_id: context.channelHeadSoul.agentId,
      channel_id: context.channelHeadSoul.channelId,
      target_action_type: context.targetActionType,
      risk_class: context.riskClass,
      workplane_status: context.workplane.status,
      gtm_lane_id: context.gtmRegistryState.laneId,
      gtm_status: context.gtmRegistryState.currentStatus,
      evidence_level: context.evidence.evidenceLevel,
      media_gate_status: context.mediaGate.status,
      originality_gate_status: context.originalityGate.status,
      quality_signal_status: context.qualitySignal.status,
      quality_signal_score: context.qualitySignal.score,
      cooldown: context.cooldown,
      caps: context.caps,
    },
    metadata: {
      soul_version: context.channelHeadSoul.soulVersion,
      receipts_count: context.recentReceipts.length,
    },
  });
}

/**
 * Record the dimension scoring as a span.
 */
export function traceScoring(
  traceId: string,
  context: ChannelHeadDecisionContext,
  dimensions: readonly { name: string; score: number; reason_codes: readonly string[] }[],
): void {
  const client = getClient();
  if (!client) return;

  client.span({
    traceId,
    name: "scoring",
    input: {
      dimensions: dimensions.map((d) => ({ name: d.name, score: d.score, reasons: d.reason_codes })),
    },
  });
}

/**
 * Record the decision as a span on the trace.
 */
export function traceDecision(
  traceId: string,
  decision: ChannelHeadDecision,
): void {
  const client = getClient();
  if (!client) return;

  client.generation({
    traceId,
    name: "decision",
    input: {
      decision_id: decision.decision_id,
      decision: decision.decision,
      risk_class: decision.risk_class,
      confidence: decision.confidence,
    },
    output: {
      decision: decision.decision,
      reason_codes: decision.reason_codes,
      explanation: decision.explanation,
      gate_required: decision.gate_required,
      non_founder_review_required: decision.non_founder_review_required,
      blockers: decision.blockers,
    },
    metadata: {
      agent_id: decision.agent_id,
      channel_id: decision.channel_id,
      decision_id: decision.decision_id,
    },
    level: decision.decision === "act" ? "DEFAULT" : "WARNING",
  });
}

/**
 * Record the autonomy receipt as a span.
 */
export function traceReceipt(
  traceId: string,
  receipt: AutonomyReceipt,
): void {
  const client = getClient();
  if (!client) return;

  client.span({
    traceId,
    name: "receipt",
    input: {
      receipt_id: receipt.receipt_id,
      receipt_type: receipt.receipt_type,
      status: receipt.status,
      risk_class: receipt.risk_class,
    },
    metadata: {
      dry_run: receipt.dry_run,
      gate_required: receipt.gate_required,
      gate_receipt_id: receipt.gate_receipt_id,
    },
  });
}

/**
 * Record a state machine transition as a span.
 */
export function traceStateTransition(
  traceId: string,
  transition: StateTransition,
): void {
  const client = getClient();
  if (!client) return;

  client.span({
    traceId,
    name: `state_transition:${transition.from}→${transition.to}`,
    input: {
      from: transition.from,
      to: transition.to,
      at: transition.at,
      reason: transition.reason,
    },
    metadata: {
      decision_id: transition.decision_id,
      receipt_id: transition.receipt_id,
    },
  });
}

/**
 * Finalise a trace by setting the overall score and level.
 */
export function finaliseTrace(traceId: string, decision: ChannelHeadDecision, state: ChannelHeadStateData): void {
  const client = getClient();
  if (!client) return;

  const level = state.state === "COMPLETE" ? "DEFAULT"
    : state.state === "FAILED" ? "ERROR"
    : "WARNING";

  client.score({
    traceId,
    name: "channel_head_decision_quality",
    value: decision.confidence,
  });

  // Note: langfuse SDK doesn't support updating trace level post-hoc.
  // We set it at creation time via the span level instead.
}
