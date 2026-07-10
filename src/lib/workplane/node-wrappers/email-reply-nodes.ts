import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type EmailReplyNodeDecision = GraphOwnedMutationDecision;

export function runZohoMailReplyNode(input: Record<string, unknown>): EmailReplyNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "email_reply_node",
    platform: "gmail",
    mutationFamily: "email_send",
    mode: "live_owned_public",
    requestedAction: "send_or_outreach",
    missingProviderBlocker: "zoho_mail_reply_provider_tool_missing",
    wrongNodeBlocker: "non_graph_email_send_blocked",
    sendOrOutreach: true,
  });
}

export function runZohoMailSendNode(input: Record<string, unknown>): EmailReplyNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "email_send_node",
    platform: "gmail",
    mutationFamily: "email_send",
    mode: "live_owned_public",
    requestedAction: "send_or_outreach",
    missingProviderBlocker: "zoho_mail_send_provider_tool_missing",
    wrongNodeBlocker: "non_graph_email_send_blocked",
    sendOrOutreach: true,
  });
}
