import type { ChannelHeadDecisionContext } from "../channel-head-context";
import type { ChannelHeadDecisionResult } from "../channel-head-decision";
import { evaluateGates } from "../decision-gates";
import { makeDecisionFromGates } from "../gate-decision-builder";
import { decideChannelHeadAction } from "../channel-head-decision";

/**
 * Owned-public-publish handler — runs the full gate chain, then delegates
 * to the legacy decision engine for the act/review path when gates pass.
 */
export function handleOwnedPublicPublish(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const gateResult = evaluateGates(context);
  if (gateResult) return makeDecisionFromGates(context, gateResult);
  return decideChannelHeadAction(context);
}
