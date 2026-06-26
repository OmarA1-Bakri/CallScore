import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  buildInitialOperatingState,
  collectReceiptsNode,
  createCallscoreOperatingGraph,
} from "../src/lib/workplane/callscore-operating-graph";
import {
  DEFAULT_OPERATING_MUTATION_FLAGS,
  type OperatingGraphState,
  type OperatingNodeResult,
} from "../src/lib/workplane/operating-graph-schemas";

const nodeStartedAt = "2026-06-25T12:00:00.000Z";
const nodeFinishedAt = "2026-06-25T12:00:01.000Z";

function fixtureNode(overrides: Partial<OperatingNodeResult>): OperatingNodeResult {
  return {
    node_id: "fixture_node",
    domain: "monitoring",
    status: "ok",
    receipt_id: "receipt-fixture-node",
    artifact_path: null,
    blockers: [],
    warnings: [],
    started_at: nodeStartedAt,
    finished_at: nodeFinishedAt,
    duration_ms: 1000,
    mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    summary: "fixture node completed",
    detail: {},
    ...overrides,
  };
}

describe("callscore operating graph", () => {
  test("boots and routes monitor goal to monitoring loop", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "monitor", testFixtures: true }),
      { configurable: { thread_id: "operating-monitor-test" } },
    );

    assert.equal(result.config.goal, "monitor");
    assert.equal(result.node_results.some((item) => item.node_id === "boot_context"), true);
    assert.equal(result.node_results.some((item) => item.node_id === "hard_gate_preflight"), true);
    assert.equal(result.node_results.some((item) => item.node_id === "monitoring_goal_loop"), true);
    assert.equal(result.node_results.some((item) => item.node_id === "operating_summary"), true);
    assert.equal(result.mutation_flags.external_mutation_performed, false);
  });

  test("revenue_now dry-run routes to revenue loop without mutation", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "revenue_now", mode: "draft_only", testFixtures: true, campaignId: "campaign-operating-test" }),
      { configurable: { thread_id: "operating-revenue-test" } },
    );

    const revenueNode = result.node_results.find((item) => item.node_id === "revenue_goal_loop");
    assert.equal(Boolean(revenueNode), true);
    assert.equal(revenueNode?.detail.review_packet_schema_version, "callscore_cmo_revenue_review_packet.v1");
    assert.equal(revenueNode?.detail.channel_publish_readiness_count, 3);
    assert.equal(revenueNode?.detail.campaign_receipt_id, "campaign-rec-campaign-operating-test");
    assert.ok(revenueNode?.artifact_path);
    assert.equal(existsSync(revenueNode!.artifact_path!), true);
    const packet = JSON.parse(readFileSync(revenueNode!.artifact_path!, "utf8")) as Record<string, unknown>;
    assert.equal(packet.schema_version, "callscore_cmo_revenue_review_packet.v1");
    assert.equal((packet.channel_publish_readiness as unknown[]).length, 3);
    assert.equal((packet.cmo_campaign_receipt as { receipt_id: string }).receipt_id, "campaign-rec-campaign-operating-test");
    assert.equal(result.mutation_flags.public_publish_performed, false);
  });

  test("revenue_now draft-only routes packet facts and visual metadata without public mutation", async () => {
    const graph = createCallscoreOperatingGraph();
    const socialPacket = {
      ok: true,
      schema: "callscore.genuine_social_packet.v3",
      copy_rule: "ZERO COPY IN PACKET. Specialist agent writes from scratch using facts as evidence.",
      facts: { raw_calls: 123, ranked_creators: 45 },
      visual_asset: { required: true, brand_gate: { ok: true } },
      policy_checks: { no_mutation: true },
    };
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "revenue_now", mode: "draft_only", testFixtures: true, campaignId: "campaign-social-packet-test" }),
      { configurable: { thread_id: "operating-revenue-social-packet-test", socialPacket, socialPacketPath: "/tmp/social-packet.json" } },
    );

    const revenueNode = result.node_results.find((item) => item.node_id === "revenue_goal_loop");
    assert.equal(revenueNode?.detail.social_packet_present, true);
    assert.equal(revenueNode?.detail.social_packet_schema, "callscore.genuine_social_packet.v3");
    assert.equal(revenueNode?.detail.social_packet_visual_required, true);
    assert.equal(revenueNode?.detail.social_packet_brand_gate_ok, true);
    assert.equal(revenueNode?.detail.social_packet_copy_rule_zero_copy, true);
    assert.equal(result.mutation_flags.public_publish_performed, false);
    const packet = JSON.parse(readFileSync(revenueNode!.artifact_path!, "utf8")) as Record<string, unknown>;
    const embedded = packet.social_packet as { facts: { raw_calls: number }; copy_rule: string };
    assert.equal(embedded.facts.raw_calls, 123);
    assert.match(embedded.copy_rule, /ZERO COPY/);
  });

  test("approved revenue publish with approval but no provider proof blocks instead of faking success", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({
        goal: "revenue_now",
        mode: "approved_publish",
        dryRun: false,
        approved: true,
        approvalReceiptId: "approval-revenue-1",
        testFixtures: true,
        campaignId: "campaign-approved-provider-block",
      }),
      {
        configurable: {
          thread_id: "operating-revenue-provider-block-test",
          workplaneStatus: { status: "OK", automation_readiness: "CONTROLLED_FULL", autonomous_revenue_status: "YES" },
        },
      },
    );

    const revenueNode = result.node_results.find((item) => item.node_id === "revenue_goal_loop");
    assert.equal(revenueNode?.status, "blocked");
    assert.equal(revenueNode?.blockers.includes("provider_proof_missing"), true);
    assert.equal(result.blockers.includes("provider_proof_missing"), true);
    assert.equal(result.mutation_flags.public_publish_performed, false);
    assert.equal(result.mutation_flags.provider_mutation_performed, false);
  });

  test("every non-revenue operating goal reaches a concrete wrapper node with no mutation", async () => {
    const cases = [
      { goal: "refresh_data", nodeId: "data_goal_loop", key: "data_pipeline_stage_count", predicate: (value: unknown) => Number(value) >= 18 },
      { goal: "dispatch_worker_once", nodeId: "worker_dispatch_goal_loop", key: "supported_job_type_count", predicate: (value: unknown) => Number(value) >= 20 },
      { goal: "produce_video", nodeId: "video_goal_loop", key: "broll_dispatcher_wired", predicate: (value: unknown) => value === true },
      { goal: "monitor", nodeId: "monitoring_goal_loop", key: "sentinel_schema_version", predicate: (value: unknown) => value === "callscore_sentinel_run_receipt.v1" },
      { goal: "trust_review", nodeId: "trust_goal_loop", key: "trust_decision", predicate: (value: unknown) => value === "review" },
      { goal: "alerts", nodeId: "alert_goal_loop", key: "send_wrapper", predicate: (value: unknown) => value === "runAlertSend" },
      { goal: "evidence_research", nodeId: "evidence_goal_loop", key: "wrapper_count", predicate: (value: unknown) => Number(value) >= 5 },
    ] as const;

    for (const item of cases) {
      const graph = createCallscoreOperatingGraph();
      const result = await graph.invoke(
        buildInitialOperatingState({ goal: item.goal, testFixtures: true, maxItems: 1 }),
        { configurable: { thread_id: `operating-${item.goal}-wrapper-test` } },
      );
      const node = result.node_results.find((candidate) => candidate.node_id === item.nodeId);
      assert.equal(Boolean(node), true, `${item.nodeId} should execute`);
      assert.equal(node?.status, "ok", `${item.nodeId} should pass`);
      assert.equal(item.predicate(node?.detail[item.key]), true, `${item.nodeId}.${item.key} should satisfy wrapper expectation`);
      assert.equal(Boolean(node?.artifact_path), true, `${item.nodeId} should write artifact`);
      assert.equal(existsSync(node!.artifact_path!), true, `${item.nodeId} artifact should exist`);
      assert.equal(result.mutation_flags.external_mutation_performed, false);
      assert.equal(result.mutation_flags.public_publish_performed, false);
    }
  });

  test("missing approval blocks approved publish before goal loop executes", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "revenue_now", mode: "approved_publish", dryRun: false, approved: false, testFixtures: true }),
      { configurable: { thread_id: "operating-approval-block-test" } },
    );

    assert.equal(result.blockers.includes("approval_missing"), true);
    assert.equal(result.node_results.some((item) => item.node_id === "revenue_goal_loop"), false);
  });

  test("unknown goals fail closed before graph invocation", () => {
    assert.throws(() => buildInitialOperatingState({ goal: "unknown" as never }), /Invalid|Unsupported|expected/);
  });

  test("collect_receipts aggregates child receipt IDs, mutation flags, and blockers by domain", async () => {
    const state: OperatingGraphState = {
      ...buildInitialOperatingState({ goal: "alerts", mode: "bounded_write", dryRun: false, approved: true, approvalReceiptId: "approval-collect-1" }),
      node_results: [
        fixtureNode({
          node_id: "data_goal_loop",
          domain: "data",
          receipt_id: "receipt-data-1",
          mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS, db_write_performed: true },
          summary: "data write completed",
        }),
        fixtureNode({
          node_id: "alert_goal_loop",
          domain: "alerts",
          status: "blocked",
          receipt_id: "receipt-alert-1",
          blockers: ["send_gate_required"],
          summary: "alert send blocked",
        }),
      ],
      blockers: ["send_gate_required"],
      mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS, db_write_performed: true },
    };

    const patch = await collectReceiptsNode(state);
    const collectResult = patch.node_results?.at(-1);
    const receipt = patch.receipts?.at(-1);

    assert.equal(collectResult?.status, "blocked");
    assert.deepEqual(collectResult?.detail.child_receipt_ids, ["receipt-data-1", "receipt-alert-1"]);
    assert.deepEqual(collectResult?.detail.blockers_by_domain, { alerts: ["send_gate_required"] });
    assert.equal(collectResult?.mutation_flags.db_write_performed, true);
    assert.equal(receipt?.mutation_flags.db_write_performed, true);
    assert.deepEqual(receipt?.parent_receipt_ids, ["receipt-data-1", "receipt-alert-1"]);
  });

  test("collect_receipts fails closed on inconsistent mutation flag aggregation", async () => {
    const state: OperatingGraphState = {
      ...buildInitialOperatingState({ goal: "alerts", mode: "bounded_write", dryRun: false, approved: true, approvalReceiptId: "approval-collect-2" }),
      node_results: [fixtureNode({
        node_id: "alert_goal_loop",
        domain: "alerts",
        receipt_id: "receipt-alert-mutating",
        mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS, public_publish_performed: true },
      })],
      mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    };

    const patch = await collectReceiptsNode(state);
    const collectResult = patch.node_results?.at(-1);

    assert.equal(collectResult?.status, "failed");
    assert.equal((collectResult?.blockers ?? []).some((item) => item.includes("mutation_flags_inconsistent")), true);
    assert.equal(collectResult?.mutation_flags.public_publish_performed, true);
  });

  test("collect_receipts redacts secret-looking child details from written artifact", async () => {
    const state: OperatingGraphState = {
      ...buildInitialOperatingState({ goal: "monitor" }),
      node_results: [fixtureNode({
        node_id: "monitoring_goal_loop",
        domain: "monitoring",
        receipt_id: "receipt-monitor-secret",
        detail: {
          command_output: "DATABASE_URL=postgres://user:pass@example/db\nAuthorization: Bearer abc.def",
          nested: { api_key: "secret-value" },
        },
      })],
    };

    const patch = await collectReceiptsNode(state);
    const collectResult = patch.node_results?.at(-1);
    assert.ok(collectResult?.artifact_path);
    const artifact = readFileSync(collectResult!.artifact_path!, "utf8");

    assert.doesNotMatch(artifact, /postgres:\/\/user:pass@example\/db/);
    assert.doesNotMatch(artifact, /abc\.def/);
    assert.doesNotMatch(artifact, /secret-value/);
    assert.match(artifact, /\[REDACTED\]/);
  });
});
