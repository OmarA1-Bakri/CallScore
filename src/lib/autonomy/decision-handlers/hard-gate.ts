import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Hard-gate handler — full gate chain for compliance/safety/trust agents.
 * Always short-circuits on fail-closed gates. Only allows "act" decisions
 * for explicitly safe gate responses (e.g., compliance linting passed).
 */
export function handleHardGate(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = evaluateGates(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return decideChannelHeadAction(context);
}
