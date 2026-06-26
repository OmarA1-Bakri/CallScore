import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type VideoPublishNodeDecision = GraphOwnedMutationDecision;

function requireField(input: Record<string, unknown>, key: string, blocker: string, nodeId: string): VideoPublishNodeDecision | null {
  const value = input[key];
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return {
      status: "blocked",
      blocker_code: blocker,
      node_id: nodeId,
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
        public_engagement_performed: false,
      },
    };
  }
  return null;
}

function payloadField(input: Record<string, unknown>, key: string): unknown {
  const payload = input.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>)[key] : undefined;
}

export function runYoutubeVideoPublishNode(input: Record<string, unknown>): VideoPublishNodeDecision {
  const nodeId = "youtube_publish_node";
  const videoPath = input.rendered_video_path ?? payloadField(input, "video_path");
  const title = payloadField(input, "title");
  const description = payloadField(input, "description");
  const thumbnail = payloadField(input, "thumbnail_path");
  if (!videoPath) return requireField({ rendered_video_path: videoPath }, "rendered_video_path", "youtube_render_missing", nodeId)!;
  if (!title) return requireField({ title }, "title", "youtube_title_missing", nodeId)!;
  if (!description) return requireField({ description }, "description", "youtube_description_missing", nodeId)!;
  if (input.thumbnail_required === true && !thumbnail) return requireField({ thumbnail_path: thumbnail }, "thumbnail_path", "youtube_thumbnail_missing", nodeId)!;
  return runGraphOwnedMutationNode({
    input,
    nodeId,
    platform: "youtube",
    mutationFamily: "video_publish",
    mode: "live_owned_public",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "youtube_provider_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
    publicPublish: true,
  });
}

export function runYoutubePublicCommentNode(input: Record<string, unknown>): VideoPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "youtube_public_comment_node",
    platform: "youtube",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "youtube_provider_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
    publicEngagement: true,
  });
}

export function runYoutubeThumbnailUpdateNode(input: Record<string, unknown>): VideoPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "youtube_thumbnail_update_node",
    platform: "youtube",
    mutationFamily: "video_update",
    mode: "live_owned_public",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "youtube_provider_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
  });
}

export function runYoutubeMetadataUpdateNode(input: Record<string, unknown>): VideoPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "youtube_metadata_update_node",
    platform: "youtube",
    mutationFamily: "video_update",
    mode: "live_owned_public",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "youtube_provider_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
  });
}
