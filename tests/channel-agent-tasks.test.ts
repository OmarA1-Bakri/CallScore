import test from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_AGENT_TASK_TYPES,
  CLAIM_NEXT_CHANNEL_TASK_SQL,
  channelTaskWorkplaneJobType,
  summarizeChannelTaskResult,
} from "../src/lib/channel-agent-tasks";
import { SUPPORTED_CHANNEL_TASK_TYPES } from "../src/scripts/hermes-worker";

test("channel agent task claim SQL uses row locks and increments attempts", () => {
  assert.match(CLAIM_NEXT_CHANNEL_TASK_SQL, /FOR UPDATE SKIP LOCKED/i);
  assert.match(CLAIM_NEXT_CHANNEL_TASK_SQL, /status = 'pending'/i);
  assert.match(CLAIM_NEXT_CHANNEL_TASK_SQL, /attempts < max_attempts/i);
  assert.match(CLAIM_NEXT_CHANNEL_TASK_SQL, /attempts = attempts \+ 1/i);
  assert.match(CLAIM_NEXT_CHANNEL_TASK_SQL, /status = 'running'/i);
});

test("Hermes worker advertises all channel-head task types", () => {
  assert.deepEqual([...SUPPORTED_CHANNEL_TASK_TYPES].sort(), [...CHANNEL_AGENT_TASK_TYPES].sort());
});

test("channel-head tasks map to safe Workplane report jobs", () => {
  assert.equal(channelTaskWorkplaneJobType("artofwar_campaign_dossier"), "artofwar_campaign_dossier");
  assert.equal(channelTaskWorkplaneJobType("owned_social_draft_and_monitor"), "artofwar_content_queue_dry_run");
  assert.equal(channelTaskWorkplaneJobType("owned_community_draft_and_monitor"), "artofwar_audience_research_dry_run");
  assert.equal(channelTaskWorkplaneJobType("whop_copy_asset_and_read_only_health"), "whop_provider_health");
  assert.equal(channelTaskWorkplaneJobType("email_partnership_draft_packet_only"), "artofwar_outreach_queue_prepare");
  assert.equal(channelTaskWorkplaneJobType("opportunity_research_brief"), "artofwar_strategy_brief");
  assert.equal(channelTaskWorkplaneJobType("compliance_lint_gate"), "artofwar_publish_approval_review");
  assert.equal(channelTaskWorkplaneJobType("data_pipeline_freshness_sentinel"), "automation_health_check");
});

test("channel task result summary proves agent execution without external mutation", () => {
  const result = summarizeChannelTaskResult({
    id: "task-1",
    agent_id: "callscore-x-linkedin-growth-head",
    channel_id: "owned_social",
    task_type: "owned_social_draft_and_monitor",
    status: "running",
    priority: 50,
    attempts: 1,
    max_attempts: 1,
    run_after: "2026-01-01T00:00:00.000Z",
    idempotency_key: "test",
    payload_hash: "sha256:test",
    payload: { allowed_external_mutation: false },
    receipt_uri: null,
    blocker: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }, { receipt: ".tmp/workflow-receipts/channel_agent_tasks/task-1.json" });

  assert.equal(result.agent_id, "callscore-x-linkedin-growth-head");
  assert.equal(result.channel_id, "owned_social");
  assert.equal(result.external_mutation_performed, false);
  assert.equal(result.workplane_job_type, "artofwar_content_queue_dry_run");
  assert.equal(result.receipt, ".tmp/workflow-receipts/channel_agent_tasks/task-1.json");
});
