import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { validCanonicalMediaArtifact } from "./helpers/canonical-media-fixture";

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

function approvedCanonicalReceipts(agentId = "callscore-test-agent") {
  const schemas = [
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
  return schemas.map((schema) => ({
    schema,
    receipt_id: `${schema.replace(/[^a-z0-9]+/gi, "-")}-approved`,
    created_at: "2026-06-25T12:00:00.000Z",
    agent_id: agentId,
    decision: "approved" as const,
    evidence_hash: `sha256:${createHash("sha256").update(schema).digest("hex")}`,
    blockers: [],
  }));
}

describe("callscore operating graph", () => {
  const artOfWarRuntimeExists = existsSync("/srv/agents/repos/Claude_Code_Automations/scripts/art_of_war.py");
  const readyWorkplaneStatus = {
    status: "OK",
    automation_readiness: "CONTROLLED_FULL",
    autonomous_revenue_status: "YES",
    public_artifact_readiness: "READY_PUBLIC_OWNED",
  } as const;
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

  test("revenue_now dry-run routes to revenue loop without mutation", { skip: !artOfWarRuntimeExists }, async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({ goal: "revenue_now", mode: "draft_only", testFixtures: true, campaignId: "campaign-operating-test" }),
      { configurable: { thread_id: "operating-revenue-test", workplaneStatus: readyWorkplaneStatus } },
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

  test("revenue_now draft-only routes packet facts and visual metadata without public mutation", { skip: !artOfWarRuntimeExists }, async () => {
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
      { configurable: { thread_id: "operating-revenue-social-packet-test", socialPacket, socialPacketPath: "/tmp/social-packet.json", workplaneStatus: readyWorkplaneStatus } },
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

  test("approved revenue publish with approval but no provider proof blocks instead of faking success", { skip: !artOfWarRuntimeExists }, async () => {
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
          workplaneStatus: readyWorkplaneStatus,
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

  test("live owned-public graph can route a rollback delete mutation to the explicit X delete node", async () => {
    const graph = createCallscoreOperatingGraph();
    const result = await graph.invoke(
      buildInitialOperatingState({
        goal: "revenue_now",
        mode: "live_owned_public",
        dryRun: false,
        approved: true,
        approvalReceiptId: "approval-delete-x-graph",
        testFixtures: true,
        artifacts: {
          graph_mutation_inputs: {
            x_post_delete_node: {
              graph_context: {
                operating_graph_run_id: "graph-run-delete-x",
                graph_node_id: "x_post_delete_node",
                goal: "revenue_now",
                platform: "x",
                mutation_family: "provider_mutation",
                acting_agent_id: "callscore-x-head",
                authority: "owned_public_publish",
                approval_receipt_id: "approval-delete-x-graph",
                approved_payload_hash: "sha256:d8f1f63c672cf4198ab7f5f7677a0de54d2920ff071a26bc3327f4f678e0920d",
                provider_execution_receipt_id: "provider-delete-x-graph",
                dry_run: false,
                parent_receipt_id: "approval-delete-x-graph",
              },
              provider_tool: "TWITTER_POST_DELETE_BY_POST_ID",
              payload: { id: "2071866502773432642" },
              provider_execution_receipt_id: "provider-delete-x-graph",
              provider_response: { ok: true, id: "2071866502773432642", deleted: true },
            },
          },
        },
      }),
      { configurable: { thread_id: "operating-x-delete-node-test" } },
    );

    const deleteNode = result.node_results.find((item) => item.node_id === "x_post_delete_node");
    assert.equal(deleteNode?.status, "ok");
    assert.equal(result.mutation_flags.provider_mutation_performed, true);
    assert.equal(result.mutation_flags.public_publish_performed, false);
  });

  test("live owned-public X publish bridges provider-uploadable media before graph-owned create", async () => {
    const previousMode = process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
    const previousMock = process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
    const previousFileUploadMode = process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
    process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = "1";
    process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE = "1";
    process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = JSON.stringify({
      TWITTER_UPLOAD_MEDIA: { ok: true, data: { id: "1455952740635586573" } },
      TWITTER_CREATION_OF_A_POST: { ok: true, data: { id: "2071866502773432642" } },
    });
    try {
      const graph = createCallscoreOperatingGraph();
      const textOnlyPayload = { text: "Graph-owned publish with required media." };
      const localPath = join(mkdtempSync(join(tmpdir(), "callscore-x-media-")), "final-x-visual.png");
      writeFileSync(localPath, "fixture-image-bytes");
      const result = await graph.invoke(
        buildInitialOperatingState({
          goal: "revenue_now",
          mode: "live_owned_public",
          dryRun: false,
          approved: true,
          approvalReceiptId: "approval-x-media-bridge",
          testFixtures: true,
          artifacts: {
            canonical_operational_package: {
              package_id: "canonical-x-media-bridge",
              channel: "x",
              created_at: "2026-06-25T12:00:00.000Z",
              receipts: approvedCanonicalReceipts("callscore-x-posting-agent"),
              media_artifact: validCanonicalMediaArtifact("x"),
            },
            graph_mutation_inputs: {
              x_owned_publish_node: {
                graph_context: {
                  operating_graph_run_id: "graph-run-x-media-bridge",
                  graph_node_id: "x_owned_publish_node",
                  goal: "revenue_now",
                  platform: "x",
                  mutation_family: "public_publish",
                  acting_agent_id: "callscore-x-posting-agent",
                  authority: "owned_public_publish",
                  approval_receipt_id: "approval-x-media-bridge",
                  evidence_receipt_id: "evidence-x-media-bridge",
                  originality_receipt_id: "originality-x-media-bridge",
                  approved_payload_hash: payloadHash(textOnlyPayload),
                  provider_execution_receipt_id: "provider-create-x-media-bridge",
                  dry_run: false,
                  parent_receipt_id: "approval-x-media-bridge",
                },
                approved: true,
                canonical_operational_package: {
                  package_id: "canonical-x-media-bridge",
                  channel: "x",
                  created_at: "2026-06-25T12:00:00.000Z",
                  receipts: approvedCanonicalReceipts("callscore-x-posting-agent"),
                  media_artifact: validCanonicalMediaArtifact("x"),
                },
                provider_tool: "TWITTER_CREATION_OF_A_POST",
                provider_payload: textOnlyPayload,
                payload: textOnlyPayload,
                media_gate: {
                  visual_required: true,
                  media_plan: "image",
                  local_path: localPath,
                  mimetype: "image/png",
                },
              },
            },
          },
        }),
        { configurable: { thread_id: "operating-x-media-bridge-test" } },
      );

      const xNode = result.node_results.find((item) => item.node_id === "x_owned_publish_node");
      assert.equal(xNode?.status, "ok");
      const providerCall = (xNode?.detail.provider_calls as Array<{ payload?: Record<string, unknown> }> | undefined)?.[0];
      assert.deepEqual(providerCall?.payload?.media_media_ids, ["1455952740635586573"]);
      assert.equal(result.mutation_flags.provider_mutation_performed, true);
      assert.equal(result.mutation_flags.public_publish_performed, true);
    } finally {
      if (previousMode === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
      else process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = previousMode;
      if (previousMock === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
      else process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = previousMock;
      if (previousFileUploadMode === undefined) delete process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE;
      else process.env.CALLSCORE_GRAPH_FILE_UPLOAD_TEST_MODE = previousFileUploadMode;
    }
  });

  test("X provider credits depleted is classified as blocked_rate_limit", async () => {
    const previousMode = process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
    const previousMock = process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
    process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = "1";
    process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = JSON.stringify({
      TWITTER_CREATION_OF_A_POST: {
        ok: false,
        error: "Request failed error: {\"title\":\"CreditsDepleted\",\"detail\":\"Your enrolled account does not have any credits to fulfill this request.\",\"status\":402}",
      },
    });
    try {
      const graph = createCallscoreOperatingGraph();
      const payload = { text: "CallScore quota-classification test" };
      const result = await graph.invoke(
        buildInitialOperatingState({
          goal: "revenue_now",
          mode: "live_owned_public",
          dryRun: false,
          approved: true,
          approvalReceiptId: "approval-x-credits-depleted",
          testFixtures: true,
          artifacts: {
            canonical_operational_package: {
              package_id: "canonical-x-credits-depleted",
              channel: "x",
              created_at: "2026-06-25T12:00:00.000Z",
              receipts: approvedCanonicalReceipts("callscore-x-posting-agent"),
              media_artifact: validCanonicalMediaArtifact("x"),
            },
            graph_mutation_inputs: {
              x_owned_publish_node: {
                graph_context: {
                  operating_graph_run_id: "graph-run-x-credits-depleted",
                  graph_node_id: "x_owned_publish_node",
                  goal: "revenue_now",
                  platform: "x",
                  mutation_family: "public_publish",
                  acting_agent_id: "callscore-x-posting-agent",
                  authority: "owned_public_publish",
                  approval_receipt_id: "approval-x-credits-depleted",
                  evidence_receipt_id: "evidence-x-credits-depleted",
                  originality_receipt_id: "originality-x-credits-depleted",
                  approved_payload_hash: payloadHash(payload),
                  provider_execution_receipt_id: "provider-x-credits-depleted",
                  dry_run: false,
                  parent_receipt_id: "approval-x-credits-depleted",
                },
                approved: true,
                canonical_operational_package: {
                  package_id: "canonical-x-credits-depleted",
                  channel: "x",
                  created_at: "2026-06-25T12:00:00.000Z",
                  receipts: approvedCanonicalReceipts("callscore-x-posting-agent"),
                  media_artifact: validCanonicalMediaArtifact("x"),
                },
                provider_tool: "TWITTER_CREATION_OF_A_POST",
                provider_payload: payload,
                payload,
              },
            },
          },
        }),
        { configurable: { thread_id: "operating-x-credits-depleted-test" } },
      );

      const xNode = result.node_results.find((item) => item.node_id === "x_owned_publish_node");
      assert.equal(xNode?.status, "blocked");
      assert.equal(xNode?.detail.blocker_code, "blocked_rate_limit");
      assert.equal(result.mutation_flags.provider_mutation_performed, false);
      assert.equal(result.mutation_flags.public_publish_performed, false);
    } finally {
      if (previousMode === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE;
      else process.env.CALLSCORE_GRAPH_PROVIDER_TEST_MODE = previousMode;
      if (previousMock === undefined) delete process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON;
      else process.env.CALLSCORE_GRAPH_PROVIDER_MOCK_RESPONSE_JSON = previousMock;
    }
  });

  test("live owned-public graph routes explicit YouTube publish mutation input to youtube publish node", async () => {
    const graph = createCallscoreOperatingGraph();
    const payload = {
      video_path: "/tmp/rendered-callscore-video.mp4",
      title: "CallScore proof package",
      description: "Operator-approved proof package.",
      thumbnail_path: "/tmp/final-youtube-thumbnail.png",
    };
    const result = await graph.invoke(
      buildInitialOperatingState({
        goal: "produce_video",
        mode: "live_owned_public",
        dryRun: false,
        approved: true,
        approvalReceiptId: "approval-youtube-publish-route",
        testFixtures: true,
        artifacts: {
          graph_mutation_inputs: {
            youtube_publish_node: {
              graph_context: {
                operating_graph_run_id: "graph-run-youtube-publish-route",
                graph_node_id: "youtube_publish_node",
                goal: "produce_video",
                platform: "youtube",
                mutation_family: "video_publish",
                acting_agent_id: "callscore-youtube-publishing-agent",
                authority: "owned_public_publish",
                approval_receipt_id: "approval-youtube-publish-route",
                evidence_receipt_id: "evidence-youtube-publish-route",
                originality_receipt_id: "originality-youtube-publish-route",
                approved_payload_hash: payloadHash(payload),
                provider_execution_receipt_id: "provider-youtube-publish-route",
                dry_run: false,
                parent_receipt_id: "approval-youtube-publish-route",
              },
              approved: true,
              provider_tool: "YOUTUBE_UPLOAD_VIDEO",
              payload,
              provider_execution_receipt_id: "provider-youtube-publish-route",
              provider_response: { ok: true, id: "yt-video-001", url: "https://youtube.com/watch?v=yt-video-001" },
              thumbnail_required: true,
            },
          },
        },
      }),
      { configurable: { thread_id: "operating-youtube-publish-route-test" } },
    );

    const youtubeNode = result.node_results.find((item) => item.node_id === "youtube_publish_node");
    assert.equal(youtubeNode?.status, "ok");
    assert.equal(result.node_results.some((item) => item.node_id === "video_goal_loop"), false);
    assert.equal(result.mutation_flags.provider_mutation_performed, true);
    assert.equal(result.mutation_flags.public_publish_performed, true);
  });

  test("live owned-public graph routes explicit Zoho Mail reply mutation input to email reply node", async () => {
    const graph = createCallscoreOperatingGraph();
    const payload = {
      accountId: "5586367000000008002",
      messageId: "1783039632062159400",
      fromAddress: "sarah.collins@call-score.com",
      toAddress: "creator@example.com",
      content: "Thanks — sending the creator record now.",
      mailFormat: "plaintext",
    };
    const result = await graph.invoke(
      buildInitialOperatingState({
        goal: "revenue_now",
        mode: "live_owned_public",
        dryRun: false,
        approved: true,
        approvalReceiptId: "approval-email-reply-route",
        testFixtures: true,
        artifacts: {
          graph_mutation_inputs: {
            email_reply_node: {
              graph_context: {
                operating_graph_run_id: "graph-run-email-reply-route",
                graph_node_id: "email_reply_node",
                goal: "revenue_now",
                platform: "gmail",
                mutation_family: "email_send",
                acting_agent_id: "callscore-email-reply-agent",
                authority: "gated_external_send",
                approval_receipt_id: "approval-email-reply-route",
                approved_payload_hash: payloadHash(payload),
                provider_execution_receipt_id: "provider-email-reply-route",
                dry_run: false,
                parent_receipt_id: "approval-email-reply-route",
              },
              approved: true,
              provider_tool: "ZOHO_MAIL_MESSAGES_REPLY_TO_EMAIL",
              payload,
              provider_execution_receipt_id: "provider-email-reply-route",
              provider_response: { ok: true, id: "zoho-reply-001" },
              target_url_or_id: "1783039632062159400",
            },
          },
        },
      }),
      { configurable: { thread_id: "operating-email-reply-route-test" } },
    );

    const emailNode = result.node_results.find((item) => item.node_id === "email_reply_node");
    assert.equal(emailNode?.status, "ok");
    assert.equal(result.node_results.some((item) => item.node_id === "revenue_goal_loop"), false);
    assert.equal(result.mutation_flags.provider_mutation_performed, true);
    assert.equal(result.mutation_flags.send_or_outreach_performed, true);
    assert.equal(result.mutation_flags.public_publish_performed, false);
  });

  test("graph-owned Zoho outbound email uses explicit email_send_node route", async () => {
    const graph = createCallscoreOperatingGraph();
    const payload = {
      accountId: "5586367000000008002",
      fromAddress: "sarah.collins@call-score.com",
      toAddress: "desk@example.com",
      subject: "Story packet for your crypto desk",
      content: "Plain-text outbound pilot body.",
      mailFormat: "plaintext",
    };
    const result = await graph.invoke(
      buildInitialOperatingState({
        goal: "revenue_now",
        mode: "live_owned_public",
        dryRun: false,
        approved: true,
        approvalReceiptId: "approval-email-send-route",
        testFixtures: true,
        artifacts: {
          graph_mutation_inputs: {
            email_send_node: {
              graph_context: {
                operating_graph_run_id: "graph-run-email-send-route",
                graph_node_id: "email_send_node",
                goal: "revenue_now",
                platform: "gmail",
                mutation_family: "email_send",
                acting_agent_id: "callscore-email-partnership-drafts-head",
                authority: "gated_external_send",
                approval_receipt_id: "approval-email-send-route",
                approved_payload_hash: payloadHash(payload),
                provider_execution_receipt_id: "provider-email-send-route",
                dry_run: false,
                parent_receipt_id: "approval-email-send-route",
              },
              approved: true,
              provider_tool: "ZOHO_MAIL_MESSAGES_SEND_EMAIL",
              payload,
              provider_execution_receipt_id: "provider-email-send-route",
              provider_response: { ok: true, id: "zoho-send-001" },
              target_url_or_id: "desk@example.com",
            },
          },
        },
      }),
      { configurable: { thread_id: "operating-email-send-route-test" } },
    );

    const emailNode = result.node_results.find((item) => item.node_id === "email_send_node");
    assert.equal(emailNode?.status, "ok");
    assert.equal(result.node_results.some((item) => item.node_id === "revenue_goal_loop"), false);
    assert.equal(result.mutation_flags.provider_mutation_performed, true);
    assert.equal(result.mutation_flags.send_or_outreach_performed, true);
    assert.equal(result.mutation_flags.public_publish_performed, false);
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
