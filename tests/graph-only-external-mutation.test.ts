import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { validCanonicalMediaArtifact } from "./helpers/canonical-media-fixture";

const socialNodesModulePath = "../src/lib/workplane/node-wrappers/" + "social-publish-nodes";
const legacyBlockerModulePath = "../src/lib/workplane/" + "legacy-external-mutation-blockers";
const graphProviderAdapterModulePath = "../src/lib/workplane/node-wrappers/" + "graph-owned-provider-adapter";

type PublishDecision = {
  readonly status: "ok" | "blocked" | "failed";
  readonly blocker_code?: string;
  readonly node_id?: string;
  readonly provider_call_permitted?: boolean;
  readonly provider_calls?: readonly unknown[];
  readonly mutation_flags?: {
    readonly provider_mutation_performed?: boolean;
    readonly public_publish_performed?: boolean;
  };
};

type SocialPublishNodesModule = {
  runXOwnedPublishNode: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
  runLinkedInOwnedPublishNode: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
  runXPostDeleteNode: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
  runLinkedInPostDeleteNode: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
  runRedditCommunityMutationNode: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
};

type LegacyBlockerModule = {
  assertLegacyCallScoreMutationBlocked: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
};

type GraphProviderAdapterModule = {
  preflightGraphOwnedProviderCall: (nodeId: string, input: Record<string, unknown>) => { readonly ok: boolean; readonly blockerCode?: string };
};

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

function destructiveAuthorization(platform: "x" | "linkedin", target: string, providerTool: string) {
  const root = mkdtempSync(join(tmpdir(), "callscore-destructive-auth-"));
  const path = join(root, `${platform}.json`);
  const raw = `${JSON.stringify({
    schema: "callscore.graph_owned_destructive_authorization_receipt.v1",
    status: "approved",
    destructive_action_authorized: true,
    action: "delete_public_post",
    platform,
    provider_tool: providerTool,
    target_external_object_id: target,
    approval_receipt_id: approvalContext.approval_receipt_id,
    approved_by_operator: "operator-test",
    source_incident_receipt_sha256: "a".repeat(64),
    created_at_utc: new Date(Date.now() - 60_000).toISOString(),
    expires_at_utc: new Date(Date.now() + 60_000).toISOString(),
  }, null, 2)}\n`;
  writeFileSync(path, raw);
  return {
    destructive_authorization_receipt_path: path,
    destructive_authorization_receipt_sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

async function loadSocialNodes(): Promise<SocialPublishNodesModule> {
  return await import(socialNodesModulePath) as SocialPublishNodesModule;
}

async function loadLegacyBlockers(): Promise<LegacyBlockerModule> {
  return await import(legacyBlockerModulePath) as LegacyBlockerModule;
}

async function loadGraphProviderAdapter(): Promise<GraphProviderAdapterModule> {
  return await import(graphProviderAdapterModulePath) as GraphProviderAdapterModule;
}

const approvalContext = {
  operating_graph_run_id: "graph-run-social-001",
  goal: "revenue_now",
  acting_agent_id: "callscore-social-publish-node",
  authority: "owned_public_publish",
  approved_payload_hash: "sha256:8ed4aa9e02eba8940c87e5d5e5834f2d8b780aa7967b51db517b2417ff54648a",
  approval_receipt_id: "approval-social-001",
  evidence_receipt_id: "evidence-social-001",
  originality_receipt_id: "originality-social-001",
  provider_execution_receipt_id: "provider-exec-social-001",
  mutation_family: "public_publish",
  dry_run: false,
};

const canonicalReceiptSchemas = [
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
  "callscore.task_router_receipt.v1",
  "callscore.tool_inheritance_receipt.v1",
  "callscore.design_bundle_reference_receipt.v1",
  "callscore.website_design_alignment_receipt.v2",
  "callscore.branding_receipt.v2",
  "callscore.brand_lockup_occlusion_check.v1",
  "callscore.media_artifact_receipt.v2",
];

function canonicalReceiptsFor(channel: "x" | "linkedin") {
  const now = new Date().toISOString();
  const platform = channel === "x"
    ? { head: "callscore-x-head", media: "callscore-x-image-agent" }
    : { head: "callscore-linkedin-head", media: "callscore-linkedin-image-agent" };
  return canonicalReceiptSchemas.map((schema) => ({
    schema,
    receipt_id: `${schema}:${channel}:test`,
    created_at: now,
    agent_id: schema === "callscore.task_router_receipt.v1" || schema === "callscore.tool_inheritance_receipt.v1"
      ? "callscore-orchestrator-head"
      : schema === "platform_fit_receipt.v1"
        ? platform.head
        : schema === "editorial_angle_receipt.v1" || schema === "same_shit_memory_receipt.v1"
          ? "callscore-cmo-head"
          : platform.media,
    decision: "approved",
    evidence_hash: "sha256:" + "a".repeat(64),
    blockers: [],
  }));
}

function canonicalPackage(channel: "x" | "linkedin", payload: unknown, receipts = canonicalReceiptsFor(channel)) {
  return {
    package_id: `pkg-${channel}-test`,
    channel,
    created_at: new Date().toISOString(),
    approved_payload_hash: payloadHash(payload),
    receipts,
    media_artifact: validCanonicalMediaArtifact(channel),
  };
}

describe("graph-only social external mutation RED contract", () => {
  test("X publish can call provider only inside x_owned_publish_node", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runXOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "legacy_parent_orchestrator" },
      payload: { text: "CallScore evidence update" },
      provider_tool: "TWITTER_CREATION_OF_A_POST",
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "non_graph_publish_blocked");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal((decision.provider_calls ?? []).length, 0);
  });

  test("X owned publish requires a canonical operational package even for text-only payloads", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runXOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "x_owned_publish_node", platform: "x" },
      payload: { text: "CallScore evidence update" },
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "post-001", url: "https://x.com/callscore/status/post-001" },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "canonical_operational_package_missing");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, false);
    assert.equal(decision.mutation_flags?.public_publish_performed, false);
  });

  test("LinkedIn owned publish requires a canonical operational package even for text-only payloads", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runLinkedInOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "linkedin_owned_publish_node", platform: "linkedin", approved_payload_hash: "sha256:8ed4aa9e02eba8940c87e5d5e5834f2d8b780aa7967b51db517b2417ff54648a" },
      payload: { text: "CallScore evidence update" },
      provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
      provider_response: { ok: true, id: "li-post-001", url: "https://linkedin.com/feed/update/li-post-001" },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "canonical_operational_package_missing");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, false);
  });

  test("X owned publish blocks text-only payload when media is required", async () => {
    const nodes = await loadSocialNodes();
    const payload = { text: "CallScore evidence update" };
    const decision = await nodes.runXOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "x_owned_publish_node", platform: "x", approved_payload_hash: payloadHash(payload) },
      payload,
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "post-visual-missing" },
      canonical_operational_package: canonicalPackage("x", payload),
      media_gate: { visual_required: true, media_plan: "image", content_type: "thought_leadership" },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "required_media_missing");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, false);
  });

  test("graph-owned provider preflight blocks before X provider call when required media is absent", async () => {
    const adapter = await loadGraphProviderAdapter();
    const payload = { text: "CallScore evidence update" };
    const decision = adapter.preflightGraphOwnedProviderCall("x_owned_publish_node", {
      graph_context: { ...approvalContext, graph_node_id: "x_owned_publish_node", platform: "x", approved_payload_hash: payloadHash(payload) },
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_payload: payload,
      payload,
      approved: true,
      approval_receipt_id: "approval-social-001",
      canonical_operational_package: canonicalPackage("x", payload),
      media_gate: { visual_required: true, media_plan: "image", content_type: "proof_post" },
    });

    assert.equal(decision.ok, false);
    assert.equal(decision.blockerCode, "required_media_missing");
  });

  test("LinkedIn owned publish blocks text-only payload when media is required", async () => {
    const nodes = await loadSocialNodes();
    const payload = {
      author: "urn:li:person:abc123",
      commentary: "CallScore evidence update",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    };
    const decision = await nodes.runLinkedInOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "linkedin_owned_publish_node", platform: "linkedin", approved_payload_hash: payloadHash(payload) },
      payload,
      provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
      provider_response: { ok: true, id: "li-visual-missing" },
      canonical_operational_package: canonicalPackage("linkedin", payload),
      media_gate: { visual_required: true, media_plan: "image", content_type: "thought_leadership" },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "required_media_missing");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, false);
  });

  test("owned publish blocks when canonical operational package is missing same-shit receipt", async () => {
    const nodes = await loadSocialNodes();
    const missingSameShit = canonicalReceiptsFor("x").filter((receipt) => receipt.schema !== "same_shit_memory_receipt.v1");
    const payload = { text: "CallScore evidence update", media_media_ids: ["1455952740635586573"] };
    const decision = await nodes.runXOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "x_owned_publish_node", platform: "x", approved_payload_hash: payloadHash(payload) },
      payload,
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "post-missing-same-shit" },
      canonical_operational_package: canonicalPackage("x", payload, missingSameShit),
      media_gate: { visual_required: true, media_plan: "image", content_type: "thought_leadership" },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "missing_same_shit_memory_receipt.v1");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, false);
  });

  test("X owned publish with provider media id and canonical receipts can pass", async () => {
    const nodes = await loadSocialNodes();
    const payload = { text: "CallScore evidence update", media_media_ids: ["1455952740635586573"] };
    const decision = await nodes.runXOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "x_owned_publish_node", platform: "x", approved_payload_hash: payloadHash(payload) },
      payload,
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "post-media-ok", url: "https://x.com/callscore/status/post-media-ok" },
      canonical_operational_package: canonicalPackage("x", payload),
      media_gate: { visual_required: true, media_plan: "image", content_type: "thought_leadership" },
    });

    assert.equal(decision.status, "ok");
    assert.equal(decision.provider_call_permitted, true);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, true);
  });

  test("LinkedIn owned publish with image object and canonical receipts can pass", async () => {
    const nodes = await loadSocialNodes();
    const payload = {
      author: "urn:li:person:abc123",
      commentary: "CallScore evidence update",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      images: [{ name: "callscore-proof.png", mimetype: "image/png", s3key: "composio/callscore/proof.png" }],
    };
    const decision = await nodes.runLinkedInOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "linkedin_owned_publish_node", platform: "linkedin", approved_payload_hash: payloadHash(payload) },
      payload,
      provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
      provider_response: { ok: true, id: "li-media-ok", url: "https://linkedin.com/feed/update/li-media-ok" },
      canonical_operational_package: canonicalPackage("linkedin", payload),
      media_gate: { visual_required: true, media_plan: "image", content_type: "thought_leadership" },
    });

    assert.equal(decision.status, "ok");
    assert.equal(decision.provider_call_permitted, true);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, true);
  });

  test("graph-owned rollback delete blocks without a durable destructive authorization receipt", async () => {
    const nodes = await loadSocialNodes();
    const xDelete = await nodes.runXPostDeleteNode({
      graph_context: {
        ...approvalContext,
        graph_node_id: "x_post_delete_node",
        platform: "x",
        mutation_family: "provider_mutation",
        approved_payload_hash: "sha256:d8f1f63c672cf4198ab7f5f7677a0de54d2920ff071a26bc3327f4f678e0920d",
      },
      provider_tool: "TWITTER_POST_DELETE_BY_POST_ID",
      payload: { id: "2071866502773432642" },
      provider_execution_receipt_id: "provider-delete-x-missing-auth",
      provider_response: { ok: true, id: "2071866502773432642", deleted: true },
    });

    assert.equal(xDelete.status, "blocked");
    assert.equal(xDelete.blocker_code, "destructive_authorization_receipt_missing");
    assert.equal(xDelete.provider_call_permitted, false);
    assert.equal(xDelete.mutation_flags?.provider_mutation_performed, false);
  });

  test("graph-owned rollback delete blocks a destructive receipt bound to another public object", async () => {
    const nodes = await loadSocialNodes();
    const xDelete = await nodes.runXPostDeleteNode({
      graph_context: {
        ...approvalContext,
        graph_node_id: "x_post_delete_node",
        platform: "x",
        mutation_family: "provider_mutation",
        approved_payload_hash: "sha256:d8f1f63c672cf4198ab7f5f7677a0de54d2920ff071a26bc3327f4f678e0920d",
      },
      provider_tool: "TWITTER_POST_DELETE_BY_POST_ID",
      payload: { id: "2071866502773432642" },
      ...destructiveAuthorization("x", "DIFFERENT_POST", "TWITTER_POST_DELETE_BY_POST_ID"),
      provider_execution_receipt_id: "provider-delete-x-wrong-target",
      provider_response: { ok: true, id: "2071866502773432642", deleted: true },
    });

    assert.equal(xDelete.status, "blocked");
    assert.equal(xDelete.blocker_code, "destructive_authorization_target_mismatch");
    assert.equal(xDelete.provider_call_permitted, false);
  });

  test("graph-owned rollback delete blocks a destructive receipt whose bytes do not match its declared hash", async () => {
    const nodes = await loadSocialNodes();
    const auth = destructiveAuthorization("x", "2071866502773432642", "TWITTER_POST_DELETE_BY_POST_ID");
    const xDelete = await nodes.runXPostDeleteNode({
      graph_context: {
        ...approvalContext,
        graph_node_id: "x_post_delete_node",
        platform: "x",
        mutation_family: "provider_mutation",
        approved_payload_hash: "sha256:d8f1f63c672cf4198ab7f5f7677a0de54d2920ff071a26bc3327f4f678e0920d",
      },
      provider_tool: "TWITTER_POST_DELETE_BY_POST_ID",
      payload: { id: "2071866502773432642" },
      ...auth,
      destructive_authorization_receipt_sha256: "0".repeat(64),
      provider_execution_receipt_id: "provider-delete-x-wrong-hash",
      provider_response: { ok: true, id: "2071866502773432642", deleted: true },
    });

    assert.equal(xDelete.status, "blocked");
    assert.equal(xDelete.blocker_code, "destructive_authorization_receipt_hash_mismatch");
    assert.equal(xDelete.provider_call_permitted, false);
  });

  test("X and LinkedIn rollback deletes are graph-owned provider mutations, not parent deletes", async () => {
    const nodes = await loadSocialNodes();

    const xDelete = await nodes.runXPostDeleteNode({
      graph_context: {
        ...approvalContext,
        graph_node_id: "x_post_delete_node",
        platform: "x",
        mutation_family: "provider_mutation",
        approved_payload_hash: "sha256:d8f1f63c672cf4198ab7f5f7677a0de54d2920ff071a26bc3327f4f678e0920d",
      },
      provider_tool: "TWITTER_POST_DELETE_BY_POST_ID",
      payload: { id: "2071866502773432642" },
      ...destructiveAuthorization("x", "2071866502773432642", "TWITTER_POST_DELETE_BY_POST_ID"),
      provider_execution_receipt_id: "provider-delete-x-001",
      provider_response: { ok: true, id: "2071866502773432642", deleted: true },
    });

    assert.equal(xDelete.status, "ok");
    assert.equal(xDelete.provider_call_permitted, true);
    assert.equal(xDelete.mutation_flags?.provider_mutation_performed, true);
    assert.equal(xDelete.mutation_flags?.public_publish_performed, false);

    const linkedInDelete = await nodes.runLinkedInPostDeleteNode({
      graph_context: {
        ...approvalContext,
        graph_node_id: "linkedin_post_delete_node",
        platform: "linkedin",
        mutation_family: "provider_mutation",
        approved_payload_hash: "sha256:a66b1315688dfd874a30eea550a655dbf4bf9eecb47b68ceac8da066f1c1df10",
      },
      provider_tool: "LINKEDIN_DELETE_POST",
      payload: { post_urn: "urn:li:share:7474081425663610880" },
      ...destructiveAuthorization("linkedin", "urn:li:share:7474081425663610880", "LINKEDIN_DELETE_POST"),
      provider_execution_receipt_id: "provider-delete-linkedin-001",
      provider_response: { ok: true, id: "urn:li:share:7474081425663610880", deleted: true },
    });

    assert.equal(linkedInDelete.status, "ok");
    assert.equal(linkedInDelete.provider_call_permitted, true);
    assert.equal(linkedInDelete.mutation_flags?.provider_mutation_performed, true);
    assert.equal(linkedInDelete.mutation_flags?.public_publish_performed, false);
  });

  test("Reddit public subreddit action is open by default when graph-owned and target exists", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runRedditCommunityMutationNode({
      graph_context: { ...approvalContext, graph_node_id: "reddit_public_comment_node", platform: "reddit", mutation_family: "public_engagement", approved_payload_hash: "sha256:8ed4aa9e02eba8940c87e5d5e5834f2d8b780aa7967b51db517b2417ff54648a" },
      target_url_or_id: "r/CryptoCurrency",
      payload: { text: "CallScore evidence update" },
      provider_tool: "REDDIT_CREATE_REDDIT_POST",
      provider_response: { ok: true, id: "reddit-post-001", url: "https://reddit.com/r/CryptoCurrency/comments/reddit-post-001" },
    });

    assert.equal(decision.status, "ok");
    assert.equal(decision.provider_call_permitted, true);
    assert.equal(decision.mutation_flags?.provider_mutation_performed, true);
  });

  test("legacy Hermes social wrapper has no provider calls and only invokes operating graph", { skip: !existsSync("/srv/agents/hermes/scripts/callscore-genuine-social-packet.sh") }, () => {
    const wrapperPath = "/srv/agents/hermes/scripts/callscore-genuine-social-packet.sh";
    assert.equal(existsSync(wrapperPath), true);
    const source = readFileSync(wrapperPath, "utf8");

    assert.match(source, /npm run operating:goal --/);
    assert.doesNotMatch(source, /TWITTER_CREATION_OF_A_POST|LINKEDIN_CREATE_LINKED_IN_POST|REDDIT_CREATE_REDDIT_POST/);
    assert.doesNotMatch(source, /COMPOSIO_MULTI_EXECUTE_TOOL|run_composio_tool|provider\.publish|xurl|x-cli/);
  });

  test("Claude_Code_Automations content creator cannot mutate CallScore external platforms", async () => {
    const blockers = await loadLegacyBlockers();
    const decision = await blockers.assertLegacyCallScoreMutationBlocked({
      source_surface: "Claude_Code_Automations:content_creator",
      callscore_goal: "revenue_now",
      attempted_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
      payload_hash: "sha256:legacy-content-creator-001",
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "non_graph_external_mutation_blocked");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("old orchestrator paths fail closed for CallScore external mutation", async () => {
    const blockers = await loadLegacyBlockers();
    const decision = await blockers.assertLegacyCallScoreMutationBlocked({
      source_surface: "parent_cron_or_harness",
      callscore_goal: "revenue_now",
      attempted_tool: "TWITTER_CREATION_OF_A_POST",
      graph_summary: {
        mode: "draft_only",
        provider_mutation_performed: false,
        public_publish_performed: false,
      },
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "non_graph_publish_blocked");
    assert.equal(decision.provider_call_permitted, false);
  });
});
