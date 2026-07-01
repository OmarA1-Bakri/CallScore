import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamMemoryAgentMessage,
  buildTeamMemoryAgentMessageAck,
} from "../src/lib/team-memory/team-memory-messages";

test("team memory agent messages provide durable inbox/outbox handoffs", () => {
  const message = buildTeamMemoryAgentMessage({
    fromAgent: "callscore-markov-head",
    toAgent: "callscore-cmo-head",
    topic: "creator_trajectory_signal",
    priority: 80,
    summary: "Creator A shifted stable to hot streak.",
    actionRequested: "Consider for today's X and YouTube angles.",
    refs: ["artifact:markov-20260701"],
  });

  assert.equal(message.schema, "callscore.team_memory_agent_message.v1");
  assert.equal(message.from_agent, "callscore-markov-head");
  assert.equal(message.to_agent, "callscore-cmo-head");
  assert.equal(message.status, "queued");
  assert.equal(message.refs.length, 1);
  assert.match(message.message_id, /^message-/);
});

test("team memory message ack records close the loop without chat memory", () => {
  const ack = buildTeamMemoryAgentMessageAck({
    messageId: "message-abc",
    ackingAgent: "callscore-cmo-head",
    status: "closed",
    outcome: "Included in daily campaign brief.",
    refs: ["artifact:campaign-brief-20260701"],
  });

  assert.equal(ack.schema, "callscore.team_memory_agent_message_ack.v1");
  assert.equal(ack.message_id, "message-abc");
  assert.equal(ack.acking_agent, "callscore-cmo-head");
  assert.equal(ack.status, "closed");
  assert.deepEqual(ack.refs, ["artifact:campaign-brief-20260701"]);
});
