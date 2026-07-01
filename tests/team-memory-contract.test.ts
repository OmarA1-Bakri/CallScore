import test from "node:test";
import assert from "node:assert/strict";
import {
  TEAM_MEMORY_ARTIFACT_ROOT,
  TEAM_MEMORY_SQLITE_PATH,
  TEAM_MEMORY_SCHEMA_SQL,
  buildTeamMemoryArtifactRef,
  buildTeamMemoryReceiptRecord,
  buildTeamMemoryLearningEventRecord,
} from "../src/lib/team-memory/team-memory-contract";

test("team memory contract defines shared SQLite and artifact roots", () => {
  assert.equal(TEAM_MEMORY_SQLITE_PATH, "/srv/agents/hermes/runtime/callscore-team-memory/team-memory.sqlite");
  assert.equal(TEAM_MEMORY_ARTIFACT_ROOT, "/srv/agents/hermes/runtime/callscore-team-memory/artifacts");
  assert.match(TEAM_MEMORY_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS team_memory_assets/);
  assert.match(TEAM_MEMORY_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS team_memory_receipts/);
  assert.match(TEAM_MEMORY_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS team_memory_learning_events/);
});

test("team memory artifact refs are content-addressed and machine-readable", () => {
  const ref = buildTeamMemoryArtifactRef({
    artifactPath: "/srv/agents/hermes/runtime/callscore-team-memory/artifacts/x/post.json",
    artifactType: "x_post_draft",
    producingAgent: "callscore-x-agent",
    channel: "x",
    content: "{\"post\":\"hello\"}\n",
  });

  assert.equal(ref.schema, "callscore.team_memory_artifact_ref.v1");
  assert.equal(ref.artifact_type, "x_post_draft");
  assert.equal(ref.producing_agent, "callscore-x-agent");
  assert.equal(ref.channel, "x");
  assert.match(ref.sha256, /^sha256:[a-f0-9]{64}$/);
});

test("team memory stores receipts and learning events as durable records", () => {
  const receipt = buildTeamMemoryReceiptRecord({
    receiptType: "platform_fit_receipt.v1",
    receiptPath: "/tmp/platform.json",
    producingAgent: "callscore-linkedin-agent",
    channel: "linkedin",
    decision: "approved",
    artifactRefs: ["asset-1"],
  });
  assert.equal(receipt.schema, "callscore.team_memory_receipt_record.v1");
  assert.equal(receipt.decision, "approved");

  const learning = buildTeamMemoryLearningEventRecord({
    eventType: "audience_objection",
    sourceAgent: "callscore-reddit-agent",
    channels: ["reddit"],
    summary: "Users asked how rankings avoid popularity bias.",
    evidenceRefs: [receipt.receipt_id],
  });
  assert.equal(learning.schema, "callscore.team_memory_learning_event_record.v1");
  assert.deepEqual(learning.channels, ["reddit"]);
  assert.match(learning.learning_event_id, /^learning-/);
});
