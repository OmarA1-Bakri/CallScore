import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { preflightGraphOwnedProviderCall } from "../src/lib/workplane/node-wrappers/graph-owned-provider-adapter";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

function mutationInput(payload: Record<string, unknown>) {
  const approvedPayloadHash = `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
  return {
    mode: "live_owned_public",
    approved: true,
    approval_receipt_id: "approval-discord-adapter",
    graph_context: {
      operating_graph_run_id: "graph-discord-adapter",
      graph_node_id: "discord_send_node",
      goal: "revenue_now",
      platform: "discord",
      mutation_family: "public_publish",
      acting_agent_id: "callscore-community-head",
      authority: "owned_public_publish",
      approval_receipt_id: "approval-discord-adapter",
      evidence_receipt_id: "evidence-discord-adapter",
      originality_receipt_id: "originality-discord-adapter",
      approved_payload_hash: approvedPayloadHash,
      dry_run: false,
      parent_receipt_id: "approval-discord-adapter",
    },
    provider_tool: "DISCORDBOT_CREATE_MESSAGE",
    provider_payload: payload,
    payload,
  };
}

test("Discord provider preflight accepts a conservative message payload", () => {
  const payload = {
    channel_id: "1105657455041577100",
    content: "CallScore evidence update",
    allowed_mentions: { parse: [] },
  };
  assert.deepEqual(preflightGraphOwnedProviderCall("discord_send_node", mutationInput(payload)), { ok: true });
});

test("Discord provider preflight rejects non-snowflake channels", () => {
  const result = preflightGraphOwnedProviderCall("discord_send_node", mutationInput({
    channel_id: "channel-123",
    content: "CallScore evidence update",
    allowed_mentions: { parse: [] },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.blockerCode, "target_missing");
});

test("Discord provider preflight rejects overlong content and broad mentions", () => {
  const overlong = preflightGraphOwnedProviderCall("discord_send_node", mutationInput({
    channel_id: "1105657455041577100",
    content: "x".repeat(2001),
    allowed_mentions: { parse: [] },
  }));
  assert.equal(overlong.blockerCode, "payload_too_long");

  const broadMentions = preflightGraphOwnedProviderCall("discord_send_node", mutationInput({
    channel_id: "1105657455041577100",
    content: "CallScore evidence update",
    allowed_mentions: { parse: ["everyone"] },
  }));
  assert.equal(broadMentions.blockerCode, "blocked_platform_permission");
});
