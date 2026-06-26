import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

export type EmailAlertNodeDecision = GraphOwnedMutationDecision;

export function runGmailSendNode(input: Record<string, unknown>): EmailAlertNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "gmail_send_node",
    platform: "gmail",
    mutationFamily: "email_send",
    mode: "bounded_write",
    requestedAction: "send_or_outreach",
    missingProviderBlocker: "gmail_provider_tool_missing",
    wrongNodeBlocker: "non_graph_email_send_blocked",
    sendOrOutreach: true,
  });
}

export function runResendAlertSendNode(input: Record<string, unknown>): EmailAlertNodeDecision {
  return runGraphOwnedMutationNode({
    input,
    nodeId: "resend_alert_send_node",
    platform: "resend",
    mutationFamily: "alert_send",
    mode: "bounded_write",
    requestedAction: "send_or_outreach",
    missingProviderBlocker: "resend_provider_tool_missing",
    wrongNodeBlocker: "non_graph_alert_send_blocked",
    sendOrOutreach: true,
  });
}
