import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertWhopBootstrapGraphContext } from "../src/scripts/bootstrap-whop";
import { assertQueuedAlertSendGraphContext } from "../src/scripts/send-queued-alerts";

const legacyBlockerModulePath = "../src/lib/workplane/" + "legacy-external-mutation-blockers";

type LegacyMutationDecision = {
  readonly status: "ok" | "blocked" | "failed";
  readonly blocker_code?: string;
  readonly provider_call_permitted?: boolean;
  readonly allowed_next_action?: string;
  readonly reason?: string;
};

type LegacyBlockerModule = {
  assertLegacyCallScoreMutationBlocked: (input: Record<string, unknown>) => LegacyMutationDecision | Promise<LegacyMutationDecision>;
};

async function loadLegacyBlockers(): Promise<LegacyBlockerModule> {
  return await import(legacyBlockerModulePath) as LegacyBlockerModule;
}

describe("legacy CallScore mutation path blockers", () => {
  test("parent cron cannot publish after draft-only graph summary", async () => {
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
    assert.equal(decision.allowed_next_action, "call_operating_goal");
  });

  test("Claude_Code_Automations CallScore content creator provider writes fail closed", async () => {
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
    assert.equal(decision.allowed_next_action, "call_operating_goal");
  });

  test("legacy video publish/upload paths fail closed outside operating graph", async () => {
    const blockers = await loadLegacyBlockers();
    for (const attempted_tool of ["YOUTUBE_UPLOAD_VIDEO", "YOUTUBE_MULTIPART_UPLOAD_VIDEO", "YOUTUBE_UPDATE_THUMBNAIL", "YOUTUBE_UPDATE_VIDEO"]) {
      const decision = await blockers.assertLegacyCallScoreMutationBlocked({
        source_surface: "legacy_video_publish_schedule",
        callscore_goal: "produce_video",
        attempted_tool,
      });

      assert.equal(decision.status, "blocked", attempted_tool);
      assert.equal(decision.blocker_code, "non_graph_youtube_mutation_blocked", attempted_tool);
      assert.equal(decision.provider_call_permitted, false, attempted_tool);
    }
  });

  test("graph-only operating goal trigger is the only allowed legacy next action", async () => {
    const blockers = await loadLegacyBlockers();
    const decision = await blockers.assertLegacyCallScoreMutationBlocked({
      source_surface: "cron_wrapper",
      callscore_goal: "revenue_now",
      attempted_tool: "npm run operating:goal",
      command: "npm run operating:goal -- --goal revenue_now --mode draft_only",
    });

    assert.equal(decision.status, "ok");
    assert.equal(decision.provider_call_permitted, false);
    assert.equal(decision.allowed_next_action, "call_operating_goal");
  });

  test("Whop bootstrap entrypoint fails closed outside graph-owned mutation node", () => {
    assert.throws(() => assertWhopBootstrapGraphContext({} as NodeJS.ProcessEnv), /non_graph_whop_mutation_blocked/);
    assert.throws(() => assertWhopBootstrapGraphContext({
      CALLSCORE_OPERATING_GRAPH_RUN_ID: "graph-run-001",
      CALLSCORE_GRAPH_NODE_ID: "whop_mutation_node",
      CALLSCORE_MUTATION_FAMILY: "whop_mutation",
      CALLSCORE_APPROVAL_RECEIPT_ID: "approval-001",
      CALLSCORE_APPROVED_PAYLOAD_HASH: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } as unknown as NodeJS.ProcessEnv), /non_graph_whop_mutation_blocked/);
  });

  test("queued alert sender entrypoint fails closed outside graph-owned send node", () => {
    assert.throws(() => assertQueuedAlertSendGraphContext({} as NodeJS.ProcessEnv), /non_graph_alert_send_blocked/);
    assert.throws(() => assertQueuedAlertSendGraphContext({
      CALLSCORE_OPERATING_GRAPH_RUN_ID: "graph-run-001",
      CALLSCORE_GRAPH_NODE_ID: "resend_alert_send_node",
      CALLSCORE_MUTATION_FAMILY: "alert_send",
      CALLSCORE_APPROVAL_RECEIPT_ID: "approval-001",
      CALLSCORE_APPROVED_PAYLOAD_HASH: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } as unknown as NodeJS.ProcessEnv), /non_graph_alert_send_blocked/);
  });
});
