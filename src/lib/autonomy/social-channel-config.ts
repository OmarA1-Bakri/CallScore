/**
 * social-channel-config.ts — Shared channel configurations for the CMO
 * marketing LangGraph orchestration layer.
 *
 * Each channel maps a channel name to its canonical agent IDs and policy
 * metadata. Used by createSocialChannelGraph() in social-channel-graph.ts.
 */

export interface SocialChannelConfig {
  /** Channel key (e.g. "x", "linkedin", "reddit"). */
  readonly channel: string;
  /** Channel head agent ID. */
  readonly channelHeadAgentId: string;
  /** Posting specialist agent ID. */
  readonly postingAgentId: string;
  /** Commenting specialist agent ID. */
  readonly commentingAgentId: string;
  /** Image/asset specialist agent ID. */
  readonly imageAgentId: string;
  /** Profile-discovery specialist agent ID. */
  readonly profileDiscoveryAgentId: string;
  /** Analytics specialist agent ID. */
  readonly analyticsAgentId: string;
  /** Whether commenting requires gated-send approval. */
  readonly gatedCommentingPolicy: boolean;
  /** GTM registry status for owned-public actions. */
  readonly allowedOwnedPublicStatus: string;
  /** Default cooldown between campaign cycles (minutes). */
  readonly cooldownCadenceMinutes: number;
}

export const CHANNEL_CONFIGS: Record<string, SocialChannelConfig> = {
  x: {
    channel: "x",
    channelHeadAgentId: "callscore-x-head",
    postingAgentId: "callscore-x-posting-agent",
    commentingAgentId: "callscore-x-commenting-agent",
    imageAgentId: "callscore-x-image-agent",
    profileDiscoveryAgentId: "callscore-x-profile-discovery-agent",
    analyticsAgentId: "callscore-x-analytics-agent",
    gatedCommentingPolicy: false,
    allowedOwnedPublicStatus: "ready_public_owned",
    cooldownCadenceMinutes: 240,
  },
  linkedin: {
    channel: "linkedin",
    channelHeadAgentId: "callscore-linkedin-head",
    postingAgentId: "callscore-linkedin-posting-agent",
    commentingAgentId: "callscore-linkedin-commenting-agent",
    imageAgentId: "callscore-linkedin-image-agent",
    profileDiscoveryAgentId: "callscore-linkedin-profile-discovery-agent",
    analyticsAgentId: "callscore-linkedin-analytics-agent",
    gatedCommentingPolicy: true,
    allowedOwnedPublicStatus: "ready_public_owned",
    cooldownCadenceMinutes: 480,
  },
  reddit: {
    channel: "reddit",
    channelHeadAgentId: "callscore-reddit-head",
    postingAgentId: "callscore-reddit-posting-agent",
    commentingAgentId: "callscore-reddit-commenting-agent",
    imageAgentId: "callscore-reddit-image-agent",
    profileDiscoveryAgentId: "callscore-reddit-profile-discovery-agent",
    analyticsAgentId: "callscore-reddit-analytics-agent",
    gatedCommentingPolicy: true,
    allowedOwnedPublicStatus: "ready_public_owned",
    cooldownCadenceMinutes: 360,
  },
};
