import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type CrmWriteNodeDecision = GraphOwnedMutationDecision;

export function runAttioWriteNode(input: Record<string, unknown>): CrmWriteNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "attio_write_node",
    platform: "attio",
    mutationFamily: "crm_write",
    mode: "live_owned_public",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "attio_provider_tool_missing",
    wrongNodeBlocker: "non_graph_crm_write_blocked",
    extraMutationFlags: { db_write_performed: true },
  });
}
