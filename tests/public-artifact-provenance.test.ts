import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateCanonicalPublicArtifact,
  summarizeCanonicalPublicArtifact,
} from "../src/lib/workplane/public-artifact-provenance";

const receiptComplete = {
  artifact_id: "artifact-canonical-x",
  channel: "x",
  artifact_type: "post",
  content_source_type: "agent_generated",
  canonical_public_artifact: true,
  generated_by_designated_workflow: true,
  workflow_id: "wf05-x-owned-public",
  agent_id: "callscore-x-head",
  child_run_id: "child-run-1",
  generation_prompt_hash: "sha256:" + "a".repeat(64),
  generation_model_or_agent_run_id: "agent-run-1",
  shared_memory_read_receipt_id: "memory-read-1",
  shared_memory_write_receipt_id: "memory-write-1",
  originality_receipt_id: "originality-1",
  same_shit_memory_receipt_id: "same-shit-1",
  role_voice_guidance_receipt_id: "voice-1",
  quality_gate_receipt_id: "quality-1",
};

test("canonical validator rejects fixture/static/script artifacts", () => {
  for (const source of ["fixture", "static_example", "script_generated", "blocked_context_only"]) {
    const decision = validateCanonicalPublicArtifact({
      ...receiptComplete,
      content_source_type: source,
      canonical_public_artifact: false,
      generated_by_designated_workflow: false,
    });
    assert.equal(decision.ok, false);
    assert.ok(decision.blocker_codes.includes("canonical_agent_generated_artifact_required"));
  }
});

test("canonical validator requires full memory and receipt lineage", () => {
  const decision = validateCanonicalPublicArtifact({
    ...receiptComplete,
    shared_memory_read_receipt_id: undefined,
    same_shit_memory_receipt_id: undefined,
  });
  assert.equal(decision.ok, false);
  assert.ok(decision.blocker_codes.includes("shared_memory_read_receipt_required"));
  assert.ok(decision.blocker_codes.includes("same_shit_memory_receipt_required"));
});

test("canonical validator requires visual receipts for video/image packages", () => {
  const decision = validateCanonicalPublicArtifact({
    ...receiptComplete,
    channel: "youtube",
    artifact_type: "video_package",
  });
  assert.equal(decision.ok, false);
  assert.ok(decision.blocker_codes.includes("visual_brief_receipt_required"));
  assert.ok(decision.blocker_codes.includes("visual_qa_receipt_required"));
  assert.ok(decision.blocker_codes.includes("copy_visual_coherence_receipt_required"));
});

test("canonical validator requires taste receipts for public-ready publish candidates", () => {
  const decision = validateCanonicalPublicArtifact({
    ...receiptComplete,
    publish_candidate_ready: true,
  });

  assert.equal(decision.ok, false);
  assert.ok(decision.blocker_codes.includes("taste_brief_receipt_required"));
  assert.ok(decision.blocker_codes.includes("taste_critique_receipt_required"));
  assert.ok(decision.blocker_codes.includes("creative_package_approval_receipt_required"));
});

test("canonical validator requires canonical editorial and platform receipts for public-ready publish candidates", () => {
  const decision = validateCanonicalPublicArtifact({
    ...receiptComplete,
    publish_candidate_ready: true,
    taste_brief_receipt_id: "taste-brief-1",
    taste_critique_receipt_id: "taste-critique-1",
    creative_package_approval_receipt_id: "creative-package-1",
  });

  assert.equal(decision.ok, false);
  assert.ok(decision.blocker_codes.includes("editorial_angle_receipt_required"));
  assert.ok(decision.blocker_codes.includes("platform_fit_receipt_required"));
});

test("canonical validator passes public-ready artifact with canonical and taste receipts", () => {
  const decision = validateCanonicalPublicArtifact({
    ...receiptComplete,
    publish_candidate_ready: true,
    editorial_angle_receipt_id: "editorial-angle-1",
    platform_fit_receipt_id: "platform-fit-1",
    taste_brief_receipt_id: "taste-brief-1",
    taste_critique_receipt_id: "taste-critique-1",
    creative_package_approval_receipt_id: "creative-package-1",
  });

  assert.equal(decision.ok, true);
  assert.deepEqual(decision.blocker_codes, []);
});

test("canonical validator passes receipt-complete agent artifact not marked public-ready", () => {
  const decision = validateCanonicalPublicArtifact({
    ...receiptComplete,
    visual_brief_receipt_id: "visual-brief-1",
    visual_qa_receipt_id: "visual-qa-1",
    copy_visual_coherence_receipt_id: "coherence-1",
  });
  assert.equal(decision.ok, true);
  assert.deepEqual(decision.blocker_codes, []);
});

test("summary marks only canonical artifacts publish eligible", () => {
  const summary = summarizeCanonicalPublicArtifact({ ...receiptComplete });
  assert.equal(summary.canonical_public_artifact, true);
  assert.equal(summary.publish_candidate_allowed, true);
});


test("canonical validator rejects malformed non-string lineage IDs", () => {
  const malformed = {
    ...receiptComplete,
    child_run_id: {},
    workflow_id: [],
    agent_id: true,
    generation_prompt_hash: 42,
    generation_model_or_agent_run_id: {},
    shared_memory_read_receipt_id: [],
    shared_memory_write_receipt_id: true,
    originality_receipt_id: {},
    same_shit_memory_receipt_id: [],
    role_voice_guidance_receipt_id: 1,
    quality_gate_receipt_id: false,
  };
  const decision = validateCanonicalPublicArtifact(malformed);
  assert.equal(decision.ok, false);
  for (const code of [
    "workflow_id_required",
    "agent_id_required",
    "generation_prompt_hash_required",
    "generation_model_or_agent_run_id_required",
    "shared_memory_read_receipt_required",
    "shared_memory_write_receipt_required",
    "originality_receipt_required",
    "same_shit_memory_receipt_required",
    "role_voice_guidance_receipt_required",
    "quality_gate_receipt_required",
    "child_or_graph_node_run_id_required",
  ]) {
    assert.ok(decision.blocker_codes.includes(code), `${code} should block malformed lineage`);
  }
});
