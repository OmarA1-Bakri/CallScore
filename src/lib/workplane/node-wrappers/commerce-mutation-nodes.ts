import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";
import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type CommerceMutationNodeDecision = GraphOwnedMutationDecision;

export interface WhopListingRollback {
  readonly operation: "WHOP_UPDATE_APP";
  readonly provider_payload: {
    readonly id: string;
    readonly description: string | null;
    readonly app_store_description: string | null;
  };
}

export type WhopListingUpdateDecision = CommerceMutationNodeDecision & {
  readonly rollback?: WhopListingRollback;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function blocked(nodeId: string, blockerCode: string): WhopListingUpdateDecision {
  return {
    status: "blocked",
    blocker_code: blockerCode,
    node_id: nodeId,
    provider_call_permitted: false,
    provider_calls: [],
    mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
  };
}

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

export function runWhopListingUpdateNode(input: Record<string, unknown>): WhopListingUpdateDecision {
  const nodeId = "whop_listing_update_node";
  if (!Array.isArray(input.canonical_receipts)) {
    return blocked(nodeId, "canonical_operational_package_missing");
  }
  if (typeof input.provider_tool === "string" && input.provider_tool !== "WHOP_UPDATE_APP") {
    return blocked(nodeId, "whop_listing_tool_not_allowed");
  }

  if (input.provider_tool === "WHOP_UPDATE_APP") {
    const payload = isRecord(input.provider_payload) ? input.provider_payload : null;
    if (!payload || payload.id !== "app_cDfDRY1cj8yQJZ") {
      return blocked(nodeId, "whop_listing_target_not_allowed");
    }
    const prior = isRecord(input.prior_listing) ? input.prior_listing : null;
    const priorDescription = prior?.description;
    const priorStoreDescription = prior?.app_store_description;
    if (!prior
      || (typeof priorDescription !== "string" && priorDescription !== null)
      || (typeof priorStoreDescription !== "string" && priorStoreDescription !== null)) {
      return blocked(nodeId, "whop_listing_rollback_metadata_missing");
    }
  }

  const decision = runGraphOwnedMutationNode({
    input,
    nodeId,
    platform: "whop",
    mutationFamily: "whop_mutation",
    mode: "approved_publish",
    requestedAction: "whop_mutation",
    missingProviderBlocker: "whop_listing_provider_tool_missing",
    wrongNodeBlocker: "non_graph_whop_mutation_blocked",
    whopMutation: true,
  });
  if (decision.status !== "ok") return decision;

  const payload = input.provider_payload as Record<string, unknown>;
  const prior = input.prior_listing as Record<string, unknown>;
  return {
    ...decision,
    rollback: {
      operation: "WHOP_UPDATE_APP",
      provider_payload: {
        id: String(payload.id),
        description: prior.description as string | null,
        app_store_description: prior.app_store_description as string | null,
      },
    },
  };
}
