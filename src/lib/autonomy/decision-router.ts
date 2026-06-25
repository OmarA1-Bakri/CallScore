import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecisionResult } from "./channel-head-decision";
import type { GateResult } from "./decision-gates";
import { authorityForAgent, type ActionAuthorityType } from "./action-authority";
import { handleOwnedPublicPublish } from "./decision-handlers/owned-public-publish";
import { handleReadOnlyObserve } from "./decision-handlers/read-only-observe";
import { handleHardGate } from "./decision-handlers/hard-gate";
import { handleDraftArtifact } from "./decision-handlers/draft-artifact";
import { handleInternalEnqueue } from "./decision-handlers/internal-enqueue";
import { handleInternalStateMutation } from "./decision-handlers/internal-state-mutation";
import { handleGatedExternalSend } from "./decision-handlers/gated-external-send";
import { makeDecisionFromGates } from "./gate-decision-builder";

type DecisionHandler = (context: ChannelHeadDecisionContext) => ChannelHeadDecisionResult;

const HANDLER_REGISTRY: Partial<Record<ActionAuthorityType, DecisionHandler>> = {
  owned_public_publish: handleOwnedPublicPublish,
  read_only_observe: handleReadOnlyObserve,
  hard_gate: handleHardGate,
  draft_artifact: handleDraftArtifact,
  internal_enqueue: handleInternalEnqueue,
  internal_state_mutation: handleInternalStateMutation,
  gated_external_send: handleGatedExternalSend,
};

/**
 * Route a decision through the correct handler based on the agent's
 * declared action authorities. The first matching handler authority
 * is used. When no authorities are resolved or no handler is registered
 * for any authority, fails closed with a schema-valid suppress result.
 */
export function routeDecision(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const agentId = context.channelHeadSoul.agentId;
  const authorities = authorityForAgent(agentId);

  // No authorities resolved — agent is unrecognised / not in any known class
  if (authorities.length === 0) {
    return makeDecisionFromGates(context, {
      decision: "suppress",
      reason_codes: ["unknown_agent_not_authorized"],
      suppress_until: undefined,
    });
  }

  for (const authority of authorities) {
    const handler = HANDLER_REGISTRY[authority];
    if (handler) return handler(context);
  }

  // Authorities resolved but none have a registered handler
  return makeDecisionFromGates(context, {
    decision: "suppress",
    reason_codes: ["no_registered_authority_handler"],
    suppress_until: undefined,
  });
}

/**
 * Batch route multiple agent contexts — used by the LangGraph node.
 */
export function routeDecisions(contexts: readonly ChannelHeadDecisionContext[]): ChannelHeadDecisionResult[] {
  return contexts.map((ctx) => routeDecision(ctx));
}
