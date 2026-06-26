import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ActionAuthority,
  authorityForAgent,
  authoritiesForClass,
  type ActionAuthorityType,
} from "../src/lib/autonomy/action-authority";

const soulsPath = join(process.cwd(), "docs/ops/callscore-channel-head-souls.yaml");

function canonicalAgentIds(): string[] {
  return Array.from(readFileSync(soulsPath, "utf8").matchAll(/^\s+- agent_id:\s*(\S+)/gm), (match) => match[1]);
}

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
  const xHead = authorityForAgent("callscore-x-head");
  assert.ok(xHead.includes("draft_artifact"));
  assert.ok(xHead.includes("owned_public_publish"));
  assert.ok(!xHead.includes("hard_gate"));
  assert.ok(!xHead.includes("read_only_observe"));
});

test("authorityForAgent returns correct authorities for LinkedIn head", () => {
  const linkedInHead = authorityForAgent("callscore-linkedin-head");
  assert.ok(linkedInHead.includes("draft_artifact"));
  assert.ok(linkedInHead.includes("owned_public_publish"));
});

test("authorityForAgent returns correct authorities for Reddit head", () => {
  const redditHead = authorityForAgent("callscore-reddit-head");
  assert.ok(redditHead.includes("draft_artifact"));
  assert.ok(redditHead.includes("owned_public_publish"));
});

test("authorityForAgent returns correct authorities for CMO head", () => {
  const cmo = authorityForAgent("callscore-cmo-head");
  assert.ok(cmo.includes("read_only_observe"));
  assert.ok(cmo.includes("internal_enqueue"));
  assert.ok(cmo.includes("draft_artifact"));
  assert.ok(!cmo.includes("owned_public_publish"));
});

test("authorityForAgent returns correct authorities for social posting agents", () => {
  const xPost = authorityForAgent("callscore-x-posting-agent");
  assert.ok(xPost.includes("draft_artifact"));
  assert.ok(xPost.includes("owned_public_publish"));
  assert.ok(!xPost.includes("gated_external_send"));

  const liPost = authorityForAgent("callscore-linkedin-posting-agent");
  assert.ok(liPost.includes("draft_artifact"));
  assert.ok(liPost.includes("owned_public_publish"));
});

test("authorityForAgent returns correct authorities for social commenting agents", () => {
  const xComment = authorityForAgent("callscore-x-commenting-agent");
  assert.ok(xComment.includes("draft_artifact"));
  assert.ok(xComment.includes("gated_external_send"));

  const redditComment = authorityForAgent("callscore-reddit-commenting-agent");
  assert.ok(redditComment.includes("draft_artifact"));
  assert.ok(redditComment.includes("gated_external_send"));
});

test("authorityForAgent returns correct authorities for social image agents", () => {
  const xImage = authorityForAgent("callscore-x-image-agent");
  assert.ok(xImage.includes("draft_artifact"));
  assert.equal(xImage.length, 1);

  const liImage = authorityForAgent("callscore-linkedin-image-agent");
  assert.ok(liImage.includes("draft_artifact"));
});

test("authorityForAgent returns correct authorities for social discovery agents", () => {
  const xDisc = authorityForAgent("callscore-x-profile-discovery-agent");
  assert.ok(xDisc.includes("read_only_observe"));
  assert.ok(xDisc.includes("internal_enqueue"));

  const redditDisc = authorityForAgent("callscore-reddit-profile-discovery-agent");
  assert.ok(redditDisc.includes("read_only_observe"));
  assert.ok(redditDisc.includes("internal_enqueue"));
});

test("authorityForAgent returns correct authorities for social analytics agents", () => {
  const xAnalytics = authorityForAgent("callscore-x-analytics-agent");
  assert.ok(xAnalytics.includes("read_only_observe"));
  assert.ok(xAnalytics.includes("internal_state_mutation"));

  const liAnalytics = authorityForAgent("callscore-linkedin-analytics-agent");
  assert.ok(liAnalytics.includes("read_only_observe"));
  assert.ok(liAnalytics.includes("internal_state_mutation"));
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

test("authorityForAgent resolves every agent from canonical souls YAML", () => {
  const missing = canonicalAgentIds().filter((agentId) => authorityForAgent(agentId).length === 0);

  assert.deepEqual(missing, []);
});

test("authoritiesForClass returns correct defaults per class", () => {
  assert.deepEqual(authoritiesForClass("channel_head"), ["draft_artifact", "owned_public_publish"]);
  assert.deepEqual(authoritiesForClass("sentinel"), ["read_only_observe", "hard_gate"]);
  assert.deepEqual(authoritiesForClass("gatekeeper"), ["hard_gate"]);
  assert.deepEqual(authoritiesForClass("pipeline_discovery"), ["read_only_observe", "internal_enqueue"]);
  assert.deepEqual(authoritiesForClass("research_head"), ["read_only_observe"]);
  assert.deepEqual(authoritiesForClass("pipeline_scorer"), ["internal_state_mutation"]);
  assert.deepEqual(authoritiesForClass("channel_head_gated_send"), ["draft_artifact", "gated_external_send"]);
  assert.deepEqual(authoritiesForClass("social_posting_agent"), ["draft_artifact", "owned_public_publish"]);
  assert.deepEqual(authoritiesForClass("social_commenting_agent"), ["draft_artifact", "gated_external_send"]);
  assert.deepEqual(authoritiesForClass("social_image_agent"), ["draft_artifact"]);
  assert.deepEqual(authoritiesForClass("social_discovery_agent"), ["read_only_observe", "internal_enqueue"]);
  assert.deepEqual(authoritiesForClass("social_analytics_agent"), ["read_only_observe", "internal_state_mutation"]);
  assert.deepEqual(authoritiesForClass("cmo_head"), ["read_only_observe", "internal_enqueue", "draft_artifact"]);
  assert.deepEqual(authoritiesForClass("nonexistent_unknown"), []);
});
