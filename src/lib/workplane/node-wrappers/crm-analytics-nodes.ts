import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type CrmAnalyticsNodeDecision = GraphOwnedMutationDecision;

export function runAttioWriteNode(input: Record<string, unknown>): CrmAnalyticsNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "attio_write_node",
    platform: "attio",
    mutationFamily: "crm_write",
    mode: "bounded_write",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "attio_provider_tool_missing",
    wrongNodeBlocker: "non_graph_crm_write_blocked",
  });
}

export function runPostHogWriteNode(input: Record<string, unknown>): CrmAnalyticsNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "posthog_write_node",
    platform: "posthog",
    mutationFamily: "analytics_write",
    mode: "bounded_write",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "posthog_provider_tool_missing",
    wrongNodeBlocker: "non_graph_crm_write_blocked",
  });
}
