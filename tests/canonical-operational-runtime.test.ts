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

const hash = `sha256:${"a".repeat(64)}`;

function receipt(type: string, decision: any = "approved") {
  return {
    schema: type,
    receipt_id: `${type}:test`,
    created_at: "2026-06-30T00:00:00.000Z",
    agent_id: "callscore-reviewer-head",
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
    evaluated_at: "2026-06-30T12:00:00.000Z",
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
    media_artifact: validCanonicalMediaArtifact("linkedin"),
  });
  assert.equal(complete.status, "approved");
  assert.deepEqual(complete.blockers, []);
  assert.doesNotThrow(() => CanonicalOperationalPackageSchema.parse(complete.package));
});

test("canonical runtime blocks stale packages and stale required receipts", () => {
  const stalePackage = evaluateCanonicalOperationalPackage({
    package_id: "pkg-stale",
    channel: "x",
    created_at: "2026-07-09T00:00:00.000Z",
    evaluated_at: "2026-07-11T00:00:00.000Z",
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => ({
      ...receipt(type),
      created_at: "2026-07-09T00:00:00.000Z",
    })),
    media_artifact: validCanonicalMediaArtifact("x"),
  });

  assert.equal(stalePackage.status, "blocked");
  assert.ok(stalePackage.blockers.includes("canonical_package_stale"));
  assert.ok(stalePackage.blockers.includes("stale_editorial_angle_receipt.v1"));
});

test("canonical runtime calls the media validator and blocks a forged receipt-only package", () => {
  const forged = evaluateCanonicalOperationalPackage({
    package_id: "pkg-forged-media",
    channel: "x",
    created_at: "2026-06-30T00:00:00.000Z",
    receipts: REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
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
test("canonical runtime rejects failed or blocked receipts", () => {
  const receipts = REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) =>
    type === "platform_fit_receipt.v1" ? receipt(type, "rejected") : receipt(type),
  );
  const result = evaluateCanonicalOperationalPackage({
    package_id: "pkg-failed",
    channel: "x",
    created_at: "2026-06-30T00:00:00.000Z",
    receipts,
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("receipt_rejected_platform_fit_receipt.v1"));
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
    receipts: [receipt("youtube_script_receipt.v1")],
  });
  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.blockers.includes("missing_youtube_packaging_receipt.v1"));
  assert.ok(blocked.blockers.includes("missing_youtube_thumbnail_receipt.v1"));

  const baseOnly = buildYoutubeProductionPackage({
    package_id: "yt-ok",
    created_at: "2026-06-30T00:00:00.000Z",
    receipts: [
      ...REQUIRED_CANONICAL_RECEIPT_TYPES.map((type) => receipt(type)),
      receipt("youtube_script_receipt.v1"),
      receipt("youtube_packaging_receipt.v1"),
      receipt("youtube_thumbnail_receipt.v1"),
      receipt("youtube_publish_package_receipt.v1"),
      receipt("youtube_analytics_receipt.v1"),
    ],
  });
  assert.equal(baseOnly.status, "blocked");
  assert.ok(baseOnly.blockers.includes("missing_canonical_media_artifact"));
});
