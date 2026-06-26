import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type SocialPublishNodeDecision = GraphOwnedMutationDecision;

export function runXOwnedPublishNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "x_owned_publish_node",
    platform: "x",
    mutationFamily: "public_publish",
    mode: "approved_publish",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "x_provider_tool_missing",
    wrongNodeBlocker: "non_graph_publish_blocked",
    publicPublish: true,
  });
}

export function runLinkedInOwnedPublishNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  if (input.oauth_confirmed === false) {
    return {
      status: "blocked",
      blocker_code: "linkedin_oauth_not_confirmed",
      node_id: "linkedin_owned_publish_node",
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

  return runGraphOwnedMutationNode({
    input,
    nodeId: "linkedin_owned_publish_node",
    platform: "linkedin",
    mutationFamily: "public_publish",
    mode: "approved_publish",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "linkedin_oauth_not_confirmed",
    wrongNodeBlocker: "non_graph_publish_blocked",
    publicPublish: true,
  });
}

export function runRedditOwnedProfilePublishNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "reddit_owned_profile_publish_node",
    platform: "reddit",
    mutationFamily: "public_publish",
    mode: "approved_publish",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "reddit_provider_tool_missing",
    wrongNodeBlocker: "non_graph_reddit_mutation_blocked",
    publicPublish: true,
  });
}

export function runRedditCommunityMutationNode(input: Record<string, unknown>): SocialPublishNodeDecision {
  if (!input.reddit_community_approval) {
    return {
      status: "blocked",
      blocker_code: "reddit_community_approval_missing",
      node_id: "reddit_comment_or_subreddit_publish_node",
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

  return runGraphOwnedMutationNode({
    input,
    nodeId: "reddit_comment_or_subreddit_publish_node",
    platform: "reddit",
    mutationFamily: "public_publish",
    mode: "approved_publish",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "reddit_provider_tool_missing",
    wrongNodeBlocker: "non_graph_reddit_mutation_blocked",
    publicPublish: true,
  });
}

export const runRedditCommentOrSubredditPublishNode = runRedditCommunityMutationNode;
