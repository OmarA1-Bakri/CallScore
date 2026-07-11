import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

type DiscordDeleteRollback = {
  readonly provider_tool: "DISCORDBOT_DELETE_MESSAGE";
  readonly provider_payload: {
    readonly channel_id: string;
    readonly message_id: string;
  };
};

type DiscordPublishReceipt = Record<string, unknown> & {
  readonly channel_id: string;
  readonly message_id: string;
  readonly delete_rollback: DiscordDeleteRollback;
};

export type DiscordPublishNodeDecision = Omit<GraphOwnedMutationDecision, "receipt"> & {
  readonly receipt?: DiscordPublishReceipt | unknown;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function runDiscordOwnedPublishNode(input: Record<string, unknown>): DiscordPublishNodeDecision {
  const decision = runGraphOwnedMutationNode({
    input,
    nodeId: "discord_send_node",
    platform: "discord",
    mutationFamily: "public_publish",
    mode: "live_owned_public",
    requestedAction: "publish_owned_public",
    missingProviderBlocker: "discord_provider_tool_missing",
    wrongNodeBlocker: "non_graph_publish_blocked",
    publicPublish: true,
  });

  if (decision.status !== "ok" || !decision.receipt || typeof decision.receipt !== "object") return decision;
  const providerPayload = input.provider_payload && typeof input.provider_payload === "object"
    ? input.provider_payload as Record<string, unknown>
    : input.payload && typeof input.payload === "object"
      ? input.payload as Record<string, unknown>
      : {};
  const providerResponse = input.provider_response && typeof input.provider_response === "object"
    ? input.provider_response as Record<string, unknown>
    : {};
  const channelId = nonEmptyString(providerResponse.channel_id) ?? nonEmptyString(providerPayload.channel_id);
  const messageId = nonEmptyString(providerResponse.message_id) ?? nonEmptyString(providerResponse.id);
  if (!channelId || !messageId) return decision;

  return {
    ...decision,
    receipt: {
      ...decision.receipt,
      channel_id: channelId,
      message_id: messageId,
      delete_rollback: {
        provider_tool: "DISCORDBOT_DELETE_MESSAGE",
        provider_payload: { channel_id: channelId, message_id: messageId },
      },
    },
  };
}