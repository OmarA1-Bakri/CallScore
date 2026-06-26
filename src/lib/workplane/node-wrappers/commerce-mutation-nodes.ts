import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type CommerceMutationNodeDecision = GraphOwnedMutationDecision;

export function runWhopMutationNode(input: Record<string, unknown>): CommerceMutationNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "whop_mutation_node",
    platform: "whop",
    mutationFamily: "whop_mutation",
    mode: "bounded_write",
    requestedAction: "whop_mutation",
    missingProviderBlocker: "whop_provider_tool_missing",
    wrongNodeBlocker: "non_graph_whop_mutation_blocked",
    whopMutation: true,
  });
}
