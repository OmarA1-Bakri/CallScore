import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionAuthority,
  authorityForAgent,
  authoritiesForClass,
  type ActionAuthorityType,
} from "../src/lib/autonomy/action-authority";

test("action-authority defines the 7 canonical authority tiers", () => {
  assert.equal(ActionAuthority.length, 7);
  assert.ok(ActionAuthority.includes("read_only_observe"));
  assert.ok(ActionAuthority.includes("internal_enqueue"));
  assert.ok(ActionAuthority.includes("draft_artifact"));
  assert.ok(ActionAuthority.includes("internal_state_mutation"));
  assert.ok(ActionAuthority.includes("owned_public_publish"));
  assert.ok(ActionAuthority.includes("gated_external_send"));
  assert.ok(ActionAuthority.includes("hard_gate"));
});

test("authorityForAgent returns correct authorities for known channel_head agents", () => {
  const xLinkedIn = authorityForAgent("callscore-x-linkedin-growth-head");
  assert.ok(xLinkedIn.includes("draft_artifact"));
  assert.ok(xLinkedIn.includes("owned_public_publish"));
  assert.ok(!xLinkedIn.includes("hard_gate"));
  assert.ok(!xLinkedIn.includes("read_only_observe"));
});

test("authorityForAgent returns correct authorities for sentinel agents", () => {
  const sentinel = authorityForAgent("callscore-data-pipeline-sentinel");
  assert.ok(sentinel.includes("read_only_observe"));
  assert.ok(sentinel.includes("hard_gate"));
  assert.ok(!sentinel.includes("owned_public_publish"));
});

test("authorityForAgent returns correct authorities for pipeline discovery agents", () => {
  const discoverer = authorityForAgent("callscore-youtube-discovery-head");
  assert.ok(discoverer.includes("read_only_observe"));
  assert.ok(discoverer.includes("internal_enqueue"));
});

test("authorityForAgent returns correct authorities for internal state mutation agents", () => {
  const scorer = authorityForAgent("callscore-scorer-head");
  assert.ok(scorer.includes("internal_state_mutation"));
});

test("authorityForAgent returns correct authorities for gated_external_send agents", () => {
  const whop = authorityForAgent("callscore-whop-commerce-head");
  assert.ok(whop.includes("draft_artifact"));
  assert.ok(whop.includes("gated_external_send"));
});

test("authorityForAgent returns empty array for unknown agents", () => {
  const unknown = authorityForAgent("callscore-unknown-agent");
  assert.ok(Array.isArray(unknown));
  assert.equal(unknown.length, 0);
});

test("authoritiesForClass returns correct defaults per class", () => {
  assert.deepEqual(authoritiesForClass("channel_head"), ["draft_artifact", "owned_public_publish"]);
  assert.deepEqual(authoritiesForClass("sentinel"), ["read_only_observe", "hard_gate"]);
  assert.deepEqual(authoritiesForClass("gatekeeper"), ["hard_gate"]);
  assert.deepEqual(authoritiesForClass("pipeline_discovery"), ["read_only_observe", "internal_enqueue"]);
  assert.deepEqual(authoritiesForClass("research_head"), ["read_only_observe"]);
  assert.deepEqual(authoritiesForClass("pipeline_scorer"), ["internal_state_mutation"]);
  assert.deepEqual(authoritiesForClass("channel_head_gated_send"), ["draft_artifact", "gated_external_send"]);
  assert.deepEqual(authoritiesForClass("nonexistent_unknown"), []);
});
