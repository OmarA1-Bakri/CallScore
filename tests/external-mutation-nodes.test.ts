import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

const emailNodesModulePath = "../src/lib/workplane/node-wrappers/" + "email-alert-nodes";
const commerceNodesModulePath = "../src/lib/workplane/node-wrappers/" + "commerce-mutation-nodes";
const crmNodesModulePath = "../src/lib/workplane/node-wrappers/" + "crm-analytics-nodes";
const discordNodesModulePath = "../src/lib/workplane/node-wrappers/" + "discord-publish-nodes";

type MutationNodeDecision = {
  readonly status: "ok" | "blocked" | "failed";
  readonly blocker_code?: string;
  readonly node_id?: string;
  readonly provider_call_permitted?: boolean;
  readonly provider_response?: unknown;
  readonly provider_calls?: readonly Record<string, unknown>[];
  readonly receipt?: unknown;
  readonly mutation_flags?: {
    readonly external_mutation_performed?: boolean;
    readonly provider_mutation_performed?: boolean;
    readonly send_or_outreach_performed?: boolean;
    readonly whop_mutation_performed?: boolean;
    readonly public_publish_performed?: boolean;
  };
};

type EmailAlertNodesModule = {
  runGmailSendNode: (input: Record<string, unknown>) => MutationNodeDecision | Promise<MutationNodeDecision>;
  runResendAlertSendNode: (input: Record<string, unknown>) => MutationNodeDecision | Promise<MutationNodeDecision>;
};

type CommerceMutationNodesModule = {
  runWhopMutationNode: (input: Record<string, unknown>) => MutationNodeDecision | Promise<MutationNodeDecision>;
};

type CrmAnalyticsNodesModule = {
  runAttioWriteNode: (input: Record<string, unknown>) => MutationNodeDecision | Promise<MutationNodeDecision>;
  runPostHogWriteNode: (input: Record<string, unknown>) => MutationNodeDecision | Promise<MutationNodeDecision>;
};

type DiscordPublishNodesModule = {
  runDiscordOwnedPublishNode: (input: Record<string, unknown>) => MutationNodeDecision | Promise<MutationNodeDecision>;
};

async function loadEmailNodes(): Promise<EmailAlertNodesModule> {
  return await import(emailNodesModulePath) as EmailAlertNodesModule;
}

async function loadCommerceNodes(): Promise<CommerceMutationNodesModule> {
  return await import(commerceNodesModulePath) as CommerceMutationNodesModule;
}

async function loadCrmNodes(): Promise<CrmAnalyticsNodesModule> {
  return await import(crmNodesModulePath) as CrmAnalyticsNodesModule;
}

async function loadDiscordNodes(): Promise<DiscordPublishNodesModule> {
  return await import(discordNodesModulePath) as DiscordPublishNodesModule;
}

function graphContext(overrides: Record<string, unknown>) {
  return {
    operating_graph_run_id: "graph-run-mutation-001",
    goal: "alerts",
    acting_agent_id: "callscore-mutation-node",
    authority: "gated_external_send",
    approval_receipt_id: "approval-mutation-001",
    approved_payload_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    provider_execution_receipt_id: "provider-exec-receipt-001",
    dry_run: false,
    ...overrides,
  };
}

describe("graph-owned external mutation nodes RED contract", () => {
  test("Gmail and Resend nodes return exact blockers when provider adapters are missing", async () => {
    const nodes = await loadEmailNodes();

    const gmail = await nodes.runGmailSendNode({
      graph_context: graphContext({ graph_node_id: "gmail_send_node", platform: "gmail", mutation_family: "email_send" }),
      payload: { to: "user@example.com", subject: "CallScore", text: "CallScore alert" },
    });
    assert.equal(gmail.status, "blocked");
    assert.equal(gmail.blocker_code, "gmail_provider_tool_missing");
    assert.equal(gmail.provider_call_permitted, false);

    const resend = await nodes.runResendAlertSendNode({
      graph_context: graphContext({ graph_node_id: "resend_alert_send_node", platform: "resend", mutation_family: "alert_send" }),
      payload: { to: "user@example.com", subject: "CallScore", text: "CallScore alert" },
    });
    assert.equal(resend.status, "blocked");
    assert.equal(resend.blocker_code, "resend_provider_tool_missing");
    assert.equal(resend.provider_call_permitted, false);
  });

  test("Gmail mocked success captures provider response and sets send mutation flags", async () => {
    const nodes = await loadEmailNodes();
    const providerResponse = { ok: true, id: "gmail-msg-001" };
    const decision = await nodes.runGmailSendNode({
      graph_context: graphContext({ graph_node_id: "gmail_send_node", platform: "gmail", mutation_family: "email_send", approved_payload_hash: "sha256:fb9502a220e5821df5a2e4d74334f671fce2d1c70faf3d22e0616a11b5cda52b" }),
      provider_tool: "GMAIL_SEND_EMAIL",
      provider_response: providerResponse,
      payload: { to: "user@example.com", subject: "CallScore", text: "CallScore alert" },
    });

    assert.equal(decision.status, "ok");
    assert.equal(decision.node_id, "gmail_send_node");
    assert.deepEqual(decision.provider_response, providerResponse);
    assert.equal(decision.mutation_flags?.external_mutation_performed, true);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, true);
    assert.equal(decision.mutation_flags?.send_or_outreach_performed, true);
    assert.equal(decision.mutation_flags?.public_publish_performed, false);
  });

  test("Whop node blocks missing adapter and sets whop mutation flag only on mocked success", async () => {
    const nodes = await loadCommerceNodes();

    const missing = await nodes.runWhopMutationNode({
      graph_context: graphContext({ graph_node_id: "whop_mutation_node", goal: "revenue_now", platform: "whop", mutation_family: "whop_mutation" }),
      payload: { operation: "update_metadata" },
    });
    assert.equal(missing.status, "blocked");
    assert.equal(missing.blocker_code, "whop_provider_tool_missing");
    assert.equal(missing.provider_call_permitted, false);

    const providerResponse = { ok: true, id: "whop-object-001" };
    const success = await nodes.runWhopMutationNode({
      graph_context: graphContext({ graph_node_id: "whop_mutation_node", goal: "revenue_now", platform: "whop", mutation_family: "whop_mutation", approved_payload_hash: "sha256:862e599bcb2a80596a97d0b06e4da0749c6ac38039df09274de01c1d2804b452" }),
      provider_tool: "WHOP_UPDATE_PRODUCT",
      provider_response: providerResponse,
      payload: { operation: "update_metadata" },
    });
    assert.equal(success.status, "ok");
    assert.deepEqual(success.provider_response, providerResponse);
    assert.equal(success.mutation_flags?.external_mutation_performed, true);
    assert.equal(success.mutation_flags?.provider_mutation_performed, true);
    assert.equal(success.mutation_flags?.whop_mutation_performed, true);
  });

  test("Attio and PostHog nodes capture mocked provider responses and block missing adapters", async () => {
    const nodes = await loadCrmNodes();

    const attioMissing = await nodes.runAttioWriteNode({
      graph_context: graphContext({ graph_node_id: "attio_write_node", goal: "revenue_now", platform: "attio", mutation_family: "crm_write" }),
      payload: { object: "company" },
    });
    assert.equal(attioMissing.status, "blocked");
    assert.equal(attioMissing.blocker_code, "attio_provider_tool_missing");

    const posthogMissing = await nodes.runPostHogWriteNode({
      graph_context: graphContext({ graph_node_id: "posthog_write_node", goal: "monitor", platform: "posthog", mutation_family: "analytics_write" }),
      payload: { event: "CallScore Test" },
    });
    assert.equal(posthogMissing.status, "blocked");
    assert.equal(posthogMissing.blocker_code, "posthog_provider_tool_missing");

    const attioResponse = { ok: true, id: "attio-record-001" };
    const attioSuccess = await nodes.runAttioWriteNode({
      graph_context: graphContext({ graph_node_id: "attio_write_node", goal: "revenue_now", platform: "attio", mutation_family: "crm_write", approved_payload_hash: "sha256:66218c2e8a77698cbc2086caeb9d722941b9ccc5cf7843c9eaed57325d466faa" }),
      provider_tool: "ATTIO_CREATE_RECORD",
      provider_response: attioResponse,
      payload: { object: "company" },
    });
    assert.equal(attioSuccess.status, "ok");
    assert.deepEqual(attioSuccess.provider_response, attioResponse);
    assert.equal(attioSuccess.mutation_flags?.external_mutation_performed, true);
    assert.equal(attioSuccess.mutation_flags?.provider_mutation_performed, true);

    const posthogResponse = { ok: true, id: "posthog-event-001" };
    const posthogSuccess = await nodes.runPostHogWriteNode({
      graph_context: graphContext({ graph_node_id: "posthog_write_node", goal: "monitor", platform: "posthog", mutation_family: "analytics_write", approved_payload_hash: "sha256:d4fa5897fa63a4d643e51d9727b1492a0e11549932479309f1c5d77a98c1a2a8" }),
      provider_tool: "POSTHOG_CAPTURE_EVENT",
      provider_response: posthogResponse,
      payload: { event: "CallScore Test" },
    });
    assert.equal(posthogSuccess.status, "ok");
    assert.deepEqual(posthogSuccess.provider_response, posthogResponse);
    assert.equal(posthogSuccess.mutation_flags?.external_mutation_performed, true);
    assert.equal(posthogSuccess.mutation_flags?.provider_mutation_performed, true);
  });
});


describe("review-fail regression coverage for graph-owned nodes", () => {
  test("X node rejects partial caller context instead of fabricating graph route fields", async () => {
    const socialNodes = await import("../src/lib/workplane/node-wrappers/social-publish-nodes");
    const decision = await socialNodes.runXOwnedPublishNode({
      graph_context: {
        operating_graph_run_id: "graph-run-partial",
        goal: "revenue_now",
        acting_agent_id: "callscore-x-head",
        authority: "owned_public_publish",
        approval_receipt_id: "approval-partial",
        evidence_receipt_id: "evidence-partial",
        originality_receipt_id: "originality-partial",
        approved_payload_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      approved: true,
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "forged-post" },
      payload: { text: "unsafe" },
    });
    assert.equal(decision.status, "blocked");
    assert.equal(decision.provider_call_permitted, false);
    assert.notEqual(decision.blocker_code, undefined);
  });

  test("nodes cannot mark success from provider_response alone without an executed provider receipt", async () => {
    const nodes = await loadEmailNodes();
    const decision = await nodes.runGmailSendNode({
      graph_context: graphContext({
        graph_node_id: "gmail_send_node",
        platform: "gmail",
        mutation_family: "email_send",
        approved_payload_hash: "sha256:fb9502a220e5821df5a2e4d74334f671fce2d1c70faf3d22e0616a11b5cda52b",
        provider_execution_receipt_id: undefined,
      }),
      provider_tool: "GMAIL_SEND_EMAIL",
      provider_response: { ok: true, id: "fake-gmail-msg" },
      payload: { to: "user@example.com", subject: "CallScore", text: "CallScore alert" },
    });
    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "provider_execution_receipt_required");
    assert.equal(decision.provider_call_permitted, false);
  });
});


describe("third-review graph-owned node payload regressions", () => {
  test("graph-owned publish nodes cannot hash one payload and expose a different provider payload", async () => {
    const socialNodes = await import("../src/lib/workplane/node-wrappers/social-publish-nodes");
    const decision = await socialNodes.runXOwnedPublishNode({
      graph_context: {
        operating_graph_run_id: "graph-run-payload-mismatch",
        graph_node_id: "x_owned_publish_node",
        goal: "revenue_now",
        platform: "x",
        mutation_family: "public_publish",
        acting_agent_id: "callscore-x-head",
        authority: "owned_public_publish",
        approval_receipt_id: "approval-payload",
        evidence_receipt_id: "evidence-payload",
        originality_receipt_id: "originality-payload",
        approved_payload_hash: "sha256:4eda0211c2f0a7861ca663e2fe56a0a05400e2a6688b86d6a8cae90273a6b637",
        dry_run: false,
      },
      approved: true,
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_payload: { text: "approved" },
      payload: { text: "unapproved" },
      provider_execution_receipt_id: "provider-exec-payload",
      provider_response: { ok: true, id: "post-123", url: "https://x.com/callscore/status/post-123" },
    });
    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "approved_payload_hash_mismatch");
    assert.equal(decision.provider_call_permitted, false);
  });
});

describe("Discord graph-owned owned-public node", () => {
  const payload = { channel_id: "channel-123", content: "hello discord" };
  const context = graphContext({
    graph_node_id: "discord_send_node",
    goal: "revenue_now",
    platform: "discord",
    mutation_family: "public_publish",
    acting_agent_id: "callscore-community-head",
    authority: "owned_public_publish",
    evidence_receipt_id: "evidence-discord-001",
    originality_receipt_id: "originality-discord-001",
    approved_payload_hash: "sha256:a999808a99fddf9c29b45837c2c5b54fcd4322dda279f25751c82a4cd876df98",
    parent_receipt_id: "approval-mutation-001",
  });

  test("blocks when the Discord provider adapter is missing", async () => {
    const nodes = await loadDiscordNodes();
    const decision = await nodes.runDiscordOwnedPublishNode({ graph_context: context, payload });
    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "discord_provider_tool_missing");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("mocked success retains channel, provider message ID, payload hash, lineage, and delete rollback metadata", async () => {
    const nodes = await loadDiscordNodes();
    const providerResponse = { ok: true, channel_id: "channel-123", message_id: "message-456" };
    const decision = await nodes.runDiscordOwnedPublishNode({
      graph_context: context,
      approved: true,
      provider_tool: "DISCORDBOT_CREATE_MESSAGE",
      provider_execution_receipt_id: "provider-exec-receipt-001",
      provider_response: providerResponse,
      provider_payload: payload,
      payload,
    });

    const receipt = decision.receipt as Record<string, unknown>;
    assert.equal(decision.status, "ok");
    assert.deepEqual(decision.provider_response, providerResponse);
    assert.equal(receipt.channel_id, "channel-123");
    assert.equal(receipt.message_id, "message-456");
    assert.equal(receipt.external_object_id, "message-456");
    assert.equal(receipt.approved_payload_hash, context.approved_payload_hash);
    assert.equal(receipt.parent_receipt_id, "approval-mutation-001");
    assert.deepEqual(receipt.child_receipt_ids, ["provider-exec-receipt-001"]);
    assert.deepEqual(receipt.delete_rollback, {
      provider_tool: "DISCORDBOT_DELETE_MESSAGE",
      provider_payload: { channel_id: "channel-123", message_id: "message-456" },
    });
    assert.equal(decision.mutation_flags?.public_publish_performed, true);
  });

  test("mocked provider failure retains response but never sets mutation flags", async () => {
    const nodes = await loadDiscordNodes();
    const failedPayload = { channel_id: "channel-123", content: "provider failure" };
    const decision = await nodes.runDiscordOwnedPublishNode({
      graph_context: {
        ...context,
        approved_payload_hash: "sha256:7e338010b45f3b9e0b2d451038165cdb4edf4f81ad9648215f96738b3d8aea75",
      },
      approved: true,
      provider_tool: "DISCORDBOT_CREATE_MESSAGE",
      provider_execution_receipt_id: "provider-exec-receipt-001",
      provider_response: { ok: false, error: "Discord rejected message" },
      provider_payload: failedPayload,
      payload: failedPayload,
    });

    assert.equal(decision.status, "failed");
    assert.equal(decision.blocker_code, "provider_success_required_before_mutation_flags");
    assert.deepEqual(decision.provider_response, { ok: false, error: "Discord rejected message" });
    assert.equal(decision.mutation_flags?.external_mutation_performed, false);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, false);
    assert.equal(decision.mutation_flags?.public_publish_performed, false);
  });
});
