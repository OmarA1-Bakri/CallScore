import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Read-only observe handler — runs minimal system-level gates
 * (kill switch, heartbeat, workplane). Allows observe operations
 * through when those gates pass.
 */
export function handleReadOnlyObserve(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = checkObserveGates(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return decideChannelHeadAction(context);
}

function checkObserveGates(ctx: ChannelHeadDecisionContext) {
  if (ctx.killSwitch.global_active) return { decision: "wait" as const, reason_codes: ["global_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (ctx.killSwitch.channel_active) return { decision: "wait" as const, reason_codes: ["channel_kill_switch_active"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.heartbeat_id) return { decision: "wait" as const, reason_codes: ["heartbeat_missing"] as readonly string[], wait_until: undefined };
  if (!ctx.heartbeat.fresh) return { decision: "wait" as const, reason_codes: ["heartbeat_stale"] as readonly string[], wait_until: undefined };
  if (ctx.workplane.status === "BLOCKED") return { decision: "wait" as const, reason_codes: ["workplane_blocked"] as readonly string[], wait_until: undefined };
  return null;
}
