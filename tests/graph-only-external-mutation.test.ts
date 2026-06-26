import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

const socialNodesModulePath = "../src/lib/workplane/node-wrappers/" + "social-publish-nodes";
const legacyBlockerModulePath = "../src/lib/workplane/" + "legacy-external-mutation-blockers";

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
  runRedditCommunityMutationNode: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
};

type LegacyBlockerModule = {
  assertLegacyCallScoreMutationBlocked: (input: Record<string, unknown>) => PublishDecision | Promise<PublishDecision>;
};

async function loadSocialNodes(): Promise<SocialPublishNodesModule> {
  return await import(socialNodesModulePath) as SocialPublishNodesModule;
}

async function loadLegacyBlockers(): Promise<LegacyBlockerModule> {
  return await import(legacyBlockerModulePath) as LegacyBlockerModule;
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

  test("X owned publish node records provider mutation only from x_owned_publish_node", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runXOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "x_owned_publish_node", platform: "x" },
      payload: { text: "CallScore evidence update" },
      provider_tool: "TWITTER_CREATION_OF_A_POST",
      provider_response: { ok: true, id: "post-001", url: "https://x.com/callscore/status/post-001" },
    });

    assert.equal(decision.status, "ok");
    assert.equal(decision.node_id, "x_owned_publish_node");
    assert.equal(decision.mutation_flags?.provider_mutation_performed, true);
    assert.equal(decision.mutation_flags?.public_publish_performed, true);
  });

  test("LinkedIn publish blocks if OAuth is not confirmed", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runLinkedInOwnedPublishNode({
      graph_context: { ...approvalContext, graph_node_id: "linkedin_owned_publish_node", platform: "linkedin" },
      payload: { text: "CallScore evidence update" },
      oauth_confirmed: false,
      provider_tool: "LINKEDIN_CREATE_LINKED_IN_POST",
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "linkedin_oauth_not_confirmed");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("Reddit subreddit action blocks without explicit community approval", async () => {
    const nodes = await loadSocialNodes();
    const decision = await nodes.runRedditCommunityMutationNode({
      graph_context: { ...approvalContext, graph_node_id: "reddit_comment_or_subreddit_publish_node", platform: "reddit" },
      destination: "r/CryptoCurrency",
      payload: { text: "CallScore evidence update" },
      reddit_community_approval: null,
      provider_tool: "REDDIT_CREATE_REDDIT_POST",
    });

    assert.equal(decision.status, "blocked");
    assert.equal(decision.blocker_code, "reddit_community_approval_missing");
    assert.equal(decision.provider_call_permitted, false);
  });

  test("legacy Hermes social wrapper has no provider calls and only invokes operating graph", () => {
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
