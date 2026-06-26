import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type VideoPublishNodeDecision = GraphOwnedMutationDecision;

function hasExplicitApproval(input: Record<string, unknown>): boolean {
  if (Object.prototype.hasOwnProperty.call(input, "approval_receipt_id")) {
    return typeof input.approval_receipt_id === "string" && input.approval_receipt_id.trim().length > 0;
  }
  const context = input.graph_context;
  return Boolean(
    context &&
    typeof context === "object" &&
    !Array.isArray(context) &&
    typeof (context as Record<string, unknown>).approval_receipt_id === "string" &&
    ((context as Record<string, unknown>).approval_receipt_id as string).trim().length > 0
  );
}

function blockedQa(): VideoPublishNodeDecision {
  return {
    status: "blocked",
    blocker_code: "youtube_qa_and_approval_required",
    node_id: "youtube_video_publish_node",
    provider_call_permitted: false,
    provider_calls: [],
    mutation_flags: {
      external_mutation_performed: false,
      send_or_outreach_performed: false,
      provider_mutation_performed: false,
      whop_mutation_performed: false,
      production_mutation_performed: false,
      db_write_performed: false,
      public_publish_performed: false,
    },
  };
}

export function runYoutubeVideoPublishNode(input: Record<string, unknown>): VideoPublishNodeDecision {
  if (!input.qa_report_path || !hasExplicitApproval(input)) {
    return blockedQa();
  }

  return runGraphOwnedMutationNode({
    input,
    nodeId: "youtube_video_publish_node",
    platform: "youtube",
    mutationFamily: "video_publish",
    mode: "approved_publish",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "youtube_provider_tool_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
    publicPublish: true,
  });
}

export function runYoutubeThumbnailUpdateNode(input: Record<string, unknown>): VideoPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "youtube_thumbnail_update_node",
    platform: "youtube",
    mutationFamily: "video_update",
    mode: "approved_publish",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "youtube_provider_tool_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
  });
}
