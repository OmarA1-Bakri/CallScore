import test from "node:test";
import assert from "node:assert/strict";
import {
  CanonicalOperationalPackageSchema,
  evaluateCanonicalOperationalPackage,
  buildLearningEvent,
  buildLearningDelta,
  buildYoutubeProductionPackage,
  REQUIRED_CANONICAL_RECEIPT_TYPES,
} from "../src/lib/autonomy/canonical-operational-runtime";
import { validCanonicalMediaArtifact } from "./helpers/canonical-media-fixture";
import { validateCanonicalMediaArtifact } from "../src/lib/agent-toolbox-contract";

const hash = `sha256:${"a".repeat(64)}`;
const baseNow = "2026-06-30T00:05:00.000Z";

function receipt(type: string, decision: any = "approved", channel = "linkedin") {
  const platformOwner = channel === "x"
    ? { head: "callscore-x-head", media: "callscore-x-image-agent" }
    : channel === "youtube"
      ? { head: "callscore-youtube-head", media: "callscore-youtube-thumbnail-agent" }
      : { head: "callscore-linkedin-head", media: "callscore-linkedin-image-agent" };
  const agentId = type === "callscore.task_router_receipt.v1" || type === "callscore.tool_inheritance_receipt.v1"
    ? "callscore-orchestrator-head"
    : type === "platform_fit_receipt.v1"
      ? platformOwner.head
      : type === "editorial_angle_receipt.v1" || type === "same_shit_memory_receipt.v1"
        ? "callscore-cmo-head"
        : platformOwner.media;
  return {
    schema: type,
    receipt_id: `${type}:test`,
    created_at: "2026-06-30T00:00:00.000Z",
    agent_id: agentId,
    decision,
    evidence_hash: hash,
    blockers: [],
  };
}
test("canonical runtime package requires every operational receipt before handoff", () => {
  const missing = evaluateCanonicalOperationalPackage({
    package_id: "pkg-missing",
    channel: "linkedin",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts: [receipt("editorial_angle_receipt.v1")],
  });
  assert.equal(missing.status, "blocked");
  assert.ok(missing.blockers.includes("missing_platform_fit_receipt.v1"));
  assert.ok(missing.blockers.includes("missing_visual_qa_receipt.v1"));
  assert.ok(missing.blockers.includes("missing_callscore.task_router_receipt.v1"));
  assert.ok(missing.blockers.includes("missing_callscore.tool_inheritance_receipt.v1"));
  assert.ok(missing.blockers.includes("missing_callscore.design_bundle_reference_receipt.v1"));
  assert.ok(missing.blockers.includes("missing_callscore.website_design_alignment_receipt.v2"));
  assert.ok(missing.blockers.includes("missing_callscore.branding_receipt.v2"));
  assert.ok(missing.blockers.includes("missing_callscore.brand_lockup_occlusion_check.v1"));
  assert.ok(missing.blockers.includes("missing_callscore.media_artifact_receipt.v2"));

  const complete = evaluateCanonicalOperationalPackage({
    package_id: "pkg-complete",
    channel: "linkedin",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
    media_artifact: validCanonicalMediaArtifact("linkedin"),
  });
  assert.equal(complete.status, "approved");
  assert.deepEqual(complete.blockers, []);
  assert.doesNotThrow(() => CanonicalOperationalPackageSchema.parse(complete.package));
});

test("canonical runtime calls the media validator and blocks a forged receipt-only package", () => {
  const forged = evaluateCanonicalOperationalPackage({
    package_id: "pkg-forged-media",
    channel: "x",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type, "approved", "x")),
    media_artifact: {
      schema: "callscore.media_artifact_receipt.v2",
      created_by_agent_id: "callscore-x-head",
      channel_head_agent_id: "callscore-x-head",
      media_type: "image",
      status: "ready",
    },
  });
  assert.equal(forged.status, "blocked");
  assert.ok(forged.blockers.some((blocker) => blocker.startsWith("canonical_media_")));
});
test("canonical runtime blocks public image media without complete collision, footer, mobile, and rendered-pixel QA", () => {
  const media = validCanonicalMediaArtifact("linkedin") as any;
  delete media.visual_qa_geometry;
  const missing = evaluateCanonicalOperationalPackage({
    package_id: "pkg-missing-visual-geometry",
    channel: "linkedin",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
    media_artifact: media,
  });
  assert.equal(missing.status, "blocked");
  assert.ok(missing.blockers.includes("canonical_media_missing_visual_qa_geometry"));

  const overlapping = validCanonicalMediaArtifact("linkedin") as any;
  overlapping.visual_qa_geometry = {
    ...overlapping.visual_qa_geometry,
    text_container_collision_count: 1,
    text_container_collisions: [{ first_selector: ".proof-source", second_selector: ".coverage" }],
  };
  const collided = evaluateCanonicalOperationalPackage({
    package_id: "pkg-collided-visual",
    channel: "linkedin",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
    media_artifact: overlapping,
  });
  assert.equal(collided.status, "blocked");
  assert.ok(collided.blockers.includes("canonical_media_text_container_collision_detected"));

  const cramped = validCanonicalMediaArtifact("linkedin") as any;
  cramped.visual_qa_geometry = {
    ...cramped.visual_qa_geometry,
    text_container_pair_check_count: 7,
    text_container_expected_pair_count: 9,
    text_container_containment_failure_count: 1,
    footer_wrapped_text_count: 1,
    caveat_to_footer_gap_px: 12,
    minimum_required_section_gap_px: 24,
    footer_minimum_inline_clearance_px: 0,
    footer_required_inline_clearance_px: 16,
  };
  const crampedResult = evaluateCanonicalOperationalPackage({
    package_id: "pkg-cramped-footer",
    channel: "linkedin",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
    media_artifact: cramped,
  });
  assert.equal(crampedResult.status, "blocked");
  assert.ok(crampedResult.blockers.includes("canonical_media_incomplete_text_container_pair_checks"));
  assert.ok(crampedResult.blockers.includes("canonical_media_text_container_containment_failed"));
  assert.ok(crampedResult.blockers.includes("canonical_media_footer_text_wrapped"));
  assert.ok(crampedResult.blockers.includes("canonical_media_section_gap_below_24px"));
  assert.ok(crampedResult.blockers.includes("canonical_media_footer_inline_clearance_below_16px"));

  const malformed = validCanonicalMediaArtifact("linkedin") as any;
  malformed.visual_qa_geometry = {
    ...malformed.visual_qa_geometry,
    text_container_collisions: undefined,
    minimum_effective_font_size_at_375_px: undefined,
    minimum_required_effective_font_size_px: 100,
    artifact_sha256: "b".repeat(64),
    evidence_sha256: "not-a-hash",
    preview_viewport_width_px: 0,
    parent_reviewer_agent_id: "callscore-linkedin-image-agent",
    parent_review_receipt_id: "",
  };
  let malformedResult: ReturnType<typeof evaluateCanonicalOperationalPackage> | undefined;
  assert.doesNotThrow(() => {
    malformedResult = evaluateCanonicalOperationalPackage({
      package_id: "pkg-malformed-visual-geometry",
      channel: "linkedin",
      created_at: "2026-06-30T00:00:00.000Z",
      approved_payload_hash: hash,
      evaluation_now: baseNow,
      receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
      media_artifact: malformed,
    });
  });
  assert.equal(malformedResult?.status, "blocked");
  assert.ok(malformedResult?.blockers.includes("canonical_media_visual_qa_geometry_invalid"));
  assert.ok(malformedResult?.blockers.includes("canonical_media_mobile_typography_below_12px"));
  assert.ok(malformedResult?.blockers.includes("canonical_media_visual_qa_artifact_hash_mismatch"));
  assert.ok(malformedResult?.blockers.includes("canonical_media_visual_qa_evidence_unbound"));
  assert.ok(malformedResult?.blockers.includes("canonical_media_visual_qa_viewport_invalid"));
  assert.ok(malformedResult?.blockers.includes("canonical_media_parent_rendered_pixel_review_missing"));

  const youtubeThumbnail = {
    schema: "callscore.media_artifact_receipt.v2",
    created_by_agent_id: "callscore-youtube-thumbnail-agent",
    channel_head_agent_id: "callscore-youtube-head",
    media_type: "thumbnail",
    visual_qa_geometry: null,
  } as any;
  assert.ok(validateCanonicalMediaArtifact(youtubeThumbnail).failure_reasons.includes("missing_visual_qa_geometry"));
});
test("canonical runtime rejects failed or blocked receipts", () => {
  const receipts = REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) =>
    type === "platform_fit_receipt.v1" ? receipt(type, "rejected", "x") : receipt(type, "approved", "x"),
  );
  const result = evaluateCanonicalOperationalPackage({
    package_id: "pkg-failed",
    channel: "x",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    evaluation_now: baseNow,
    receipts,
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("receipt_rejected_platform_fit_receipt.v1"));
});

test("canonical package binds current canonical receipts to channel and approved payload", () => {
  const now = "2026-07-16T02:00:00.000Z";
  const approvedPayloadHash = `sha256:${"b".repeat(64)}`;
  const ownerFor = (schema: string) => {
    if (schema === "callscore.task_router_receipt.v1" || schema === "callscore.tool_inheritance_receipt.v1") return "callscore-orchestrator-head";
    if (schema === "platform_fit_receipt.v1") return "callscore-x-head";
    if (["visual_brief_receipt.v1", "visual_qa_receipt.v1", "copy_visual_coherence_receipt.v1", "callscore.design_bundle_reference_receipt.v1", "callscore.website_design_alignment_receipt.v2", "callscore.branding_receipt.v2", "callscore.brand_lockup_occlusion_check.v1", "callscore.media_artifact_receipt.v2"].includes(schema)) return "callscore-x-image-agent";
    return "callscore-cmo-head";
  };
  const validInput = {
    package_id: "pkg-bound",
    channel: "x",
    created_at: now,
    approved_payload_hash: approvedPayloadHash,
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((schema) => ({ ...receipt(schema), created_at: now, agent_id: ownerFor(schema) })),
    media_artifact: validCanonicalMediaArtifact("x"),
    evaluation_now: now,
    expected_channel: "x",
    expected_payload_hash: approvedPayloadHash,
  } as any;

  assert.equal(evaluateCanonicalOperationalPackage(validInput).status, "approved");
  assert.ok(evaluateCanonicalOperationalPackage({ ...validInput, expected_channel: "linkedin" }).blockers.includes("canonical_package_channel_mismatch"));
  assert.ok(evaluateCanonicalOperationalPackage({ ...validInput, expected_payload_hash: `sha256:${"c".repeat(64)}` }).blockers.includes("canonical_package_payload_hash_mismatch"));
  assert.ok(evaluateCanonicalOperationalPackage({ ...validInput, created_at: "2026-07-14T00:00:00.000Z" }).blockers.includes("canonical_package_stale"));
  const wrongOwnerReceipts = validInput.receipts.map((item: any) => item.schema === "platform_fit_receipt.v1" ? { ...item, agent_id: "callscore-cmo-head" } : item);
  assert.ok(evaluateCanonicalOperationalPackage({ ...validInput, receipts: wrongOwnerReceipts }).blockers.includes("receipt_wrong_owner_platform_fit_receipt.v1"));
});

test("learning event and delta schemas support runtime self-improvement loops", () => {
  const event = buildLearningEvent({
    event_type: "bad_publish",
    trigger: "user_feedback",
    affected_agents: ["callscore-cmo-head", "callscore-linkedin-posting-agent"],
    affected_channels: ["linkedin"],
    observed_failure: "generic cross-platform post escaped",
    severity: "critical",
    evidence_paths: ["docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json"],
  });
  assert.equal(event.schema, "learning_event.v1");
  const delta = buildLearningDelta({
    source_learning_event: event.receipt_id,
    target_agent_or_flow: "callscore-cmo-head",
    proposed_update: "Require platform-native editorial receipt before handoff",
  });
  assert.equal(delta.schema, "learning_delta.v1");
  assert.equal(delta.approved_for_implementation, false);
});
test("YouTube production package requires base canonical receipts plus script, packaging, thumbnail, publish, and analytics receipts", () => {
  const blocked = buildYoutubeProductionPackage({
    package_id: "yt-missing",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    receipts: [receipt("youtube_script_receipt.v1", "approved", "youtube")],
  });
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockers.includes("missing_youtube_packaging_receipt.v1"));
  assert.ok(blocked.blockers.includes("missing_youtube_thumbnail_receipt.v1"));

  const baseOnly = buildYoutubeProductionPackage({
    package_id: "yt-ok",
    created_at: "2026-06-30T00:00:00.000Z",
    approved_payload_hash: hash,
    receipts: [
      ...REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type, "approved", "youtube")),
      receipt("youtube_script_receipt.v1", "approved", "youtube"),
      receipt("youtube_packaging_receipt.v1", "approved", "youtube"),
      receipt("youtube_thumbnail_receipt.v1", "approved", "youtube"),
      receipt("youtube_publish_package_receipt.v1", "approved", "youtube"),
      receipt("youtube_analytics_receipt.v1", "approved", "youtube"),
    ],
  });
  assert.equal(baseOnly.status, "blocked");
  assert.ok(baseOnly.blockers.includes("missing_canonical_media_artifact"));
});
