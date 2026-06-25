import type { ChannelHeadDecisionContext } from "./channel-head-context";
import type { ChannelHeadDecisionResult } from "./channel-head-decision";
import { authorityForAgent, type ActionAuthorityType } from "./action-authority";
import { handleOwnedPublicPublish } from "./decision-handlers/owned-public-publish";
import { handleReadOnlyObserve } from "./decision-handlers/read-only-observe";
import { handleHardGate } from "./decision-handlers/hard-gate";
import { handleDraftArtifact } from "./decision-handlers/draft-artifact";
import { handleInternalEnqueue } from "./decision-handlers/internal-enqueue";
import { handleInternalStateMutation } from "./decision-handlers/internal-state-mutation";
import { handleGatedExternalSend } from "./decision-handlers/gated-external-send";
import { decideChannelHeadAction } from "./channel-head-decision";

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
 * declared action authorities. The most specific matching handler
 * is used. When no handler is registered for any of the agent's
 * authorities, falls back to the legacy decision engine.
 */
export function routeDecision(context: ChannelHeadDecisionContext): ChannelHeadDecisionResult {
  const agentId = context.channelHeadSoul.agentId;
  const authorities = authorityForAgent(agentId);

  for (const authority of authorities) {
    const handler = HANDLER_REGISTRY[authority];
    if (handler) return handler(context);
  }

  // Fallback: legacy decision engine for agents with no specific handler
  return decideChannelHeadAction(context);
}

/**
 * Batch route multiple agent contexts — used by the LangGraph node.
 */
export function routeDecisions(contexts: readonly ChannelHeadDecisionContext[]): ChannelHeadDecisionResult[] {
  return contexts.map((ctx) => routeDecision(ctx));
}
