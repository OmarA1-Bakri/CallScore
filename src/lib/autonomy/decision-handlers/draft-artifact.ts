import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Draft-artifact handler — runs a lightweight gate chain suitable for
 * draft-only operations (kill switch, heartbeat, workplane).
 * Drafts are always dry-run / non-mutating, so publish-specific gates
 * (registry readiness, evidence completeness, media/originality) are skipped.
 */
export function handleDraftArtifact(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = checkDraftGates(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return decideChannelHeadAction(context);
}

function checkDraftGates(ctx: ChannelHeadDecisionContext) {
  if (ctx.killSwitch.global_active) return { decision: "wait" as const, reason_codes: ["global_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (ctx.killSwitch.channel_active) return { decision: "wait" as const, reason_codes: ["channel_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (ctx.killSwitch.agent_paused) return { decision: "wait" as const, reason_codes: ["agent_paused"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait" as const, reason_codes: ["heartbeat_missing"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.fresh) return { decision: "wait" as const, reason_codes: ["heartbeat_stale"] as readonly string[], wait_until: undefined };
  if (ctx.workplane.status === "BLOCKED") return { decision: "wait" as const, reason_codes: ["workplane_blocked"] as readonly string[], wait_until: undefined };
  return null;
}
