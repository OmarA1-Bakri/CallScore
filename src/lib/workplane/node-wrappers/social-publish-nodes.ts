import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type SocialPublishNodeDecision = GraphOwnedMutationDecision;

export function runXOwnedPublishNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "x_owned_publish_node",
    platform: "x",
    mutationFamily: "public_publish",
    mode: "live_owned_public",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "x_provider_tool_missing",
    wrongNodeBlocker: "non_graph_publish_blocked",
    publicPublish: true,
  });
}

export function runLinkedInOwnedPublishNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "linkedin_owned_publish_node",
    platform: "linkedin",
    mutationFamily: "public_publish",
    mode: "live_owned_public",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "linkedin_provider_tool_missing",
    wrongNodeBlocker: "non_graph_publish_blocked",
    publicPublish: true,
  });
}

export function runXPostDeleteNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "x_post_delete_node",
    platform: "x",
    mutationFamily: "provider_mutation",
    mode: "live_owned_public",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "x_delete_provider_tool_missing",
    wrongNodeBlocker: "non_graph_publish_blocked",
  });
}

export function runLinkedInPostDeleteNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "linkedin_post_delete_node",
    platform: "linkedin",
    mutationFamily: "provider_mutation",
    mode: "live_owned_public",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "linkedin_delete_provider_tool_missing",
    wrongNodeBlocker: "non_graph_publish_blocked",
  });
}

export function runRedditOwnedProfilePublishNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "reddit_owned_publish_node",
    platform: "reddit",
    mutationFamily: "public_publish",
    mode: "live_owned_public",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "reddit_provider_tool_missing",
    wrongNodeBlocker: "non_graph_reddit_mutation_blocked",
    publicPublish: true,
  });
}

export function runRedditCommunityMutationNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "reddit_public_comment_node",
    platform: "reddit",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "reddit_provider_tool_missing",
    wrongNodeBlocker: "non_graph_reddit_mutation_blocked",
    publicEngagement: true,
  });
}


export const runRedditCommentOrSubredditPublishNode = runRedditCommunityMutationNode;

export function runXFollowUserNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "x_follow_user_node",
    platform: "x",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "x_follow_provider_missing",
    wrongNodeBlocker: "non_graph_follow_blocked",
    publicEngagement: true,
  });
}

export function runXPublicReplyNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "x_public_reply_node",
    platform: "x",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "x_provider_tool_missing",
    wrongNodeBlocker: "non_graph_engagement_blocked",
    publicEngagement: true,
  });
}

export function runLinkedInPublicCommentNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "linkedin_public_comment_node",
    platform: "linkedin",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "linkedin_provider_tool_missing",
    wrongNodeBlocker: "non_graph_engagement_blocked",
    publicEngagement: true,
  });
}

export function runXPublicLikeNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "x_public_like_node",
    platform: "x",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "x_provider_tool_missing",
    wrongNodeBlocker: "non_graph_engagement_blocked",
    publicEngagement: true,
  });
}

export function runLinkedInPublicReactionNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "linkedin_public_reaction_node",
    platform: "linkedin",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "linkedin_provider_missing",
    wrongNodeBlocker: "non_graph_engagement_blocked",
    publicEngagement: true,
  });
}

export function runRedditPublicUpvoteNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "reddit_public_upvote_node",
    platform: "reddit",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "reddit_provider_tool_missing",
    wrongNodeBlocker: "non_graph_engagement_blocked",
    publicEngagement: true,
  });
}

export function runYoutubePublicLikeNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "youtube_public_like_node",
    platform: "youtube",
    mutationFamily: "public_engagement",
    mode: "live_owned_public",
    requestedAction: "public_engagement",
    missingProviderBlocker: "youtube_provider_missing",
    wrongNodeBlocker: "non_graph_youtube_mutation_blocked",
    publicEngagement: true,
  });
}
