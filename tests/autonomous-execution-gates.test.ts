import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyOwnedPublicEvidence,
  normalizeWorkflowStatus,
  visualReady,
  type OwnedPublicEvidenceInput,
} from "../src/lib/autonomy/autonomous-execution-gates";

const requiredDraftReceipts = [
  "editorial_angle_receipt.v1",
  "platform_fit_receipt.v1",
  "visual_brief_receipt.v1",
  "visual_qa_receipt.v1",
  "copy_visual_coherence_receipt.v1",
  "same_shit_memory_receipt.v1",
] as const;

const baseDraft: OwnedPublicEvidenceInput = {
  execution_mode: "draft_ready",
  data_packet: {
    source: "live",
    call_count: 16561,
    public_calls: 8152,
    ranked_creators: 42,
    top_creators: [{ name: "99Bitcoins" }],
  },
  x: {
    exact_copy: "Receipts beat vibes. CallScore now ranks 42 crypto creators from 8,152 public calls. call-score.com",
    growth_mechanics: { target_entities: ["crypto"], media_plan: "image", cta: "call-score.com" },
  },
  linkedin: {
    exact_copy: "Crypto creator trust needs receipts, not vibes. CallScore ranks 42 creators from 8,152 public calls so operators can audit signal quality. Explore call-score.com",
    growth_mechanics: { target_entities: ["crypto operators"], media_plan: "image", cta: "call-score.com" },
  },
  quality_gate: { ok: true, failures: [] },
  visual_asset: { required: true, png_sha256: `sha256:${"a".repeat(64)}`, kind: "product_screenshot", alt_text: "CallScore leaderboard" },
  graph_owned_path: { preview_available: true },
  ceremonial_receipts: requiredDraftReceipts,
};

test("draft-ready evidence blocks when required canonical receipt aliases are missing", () => {
  const result = classifyOwnedPublicEvidence({ ...baseDraft, ceremonial_receipts: [] });
  assert.equal(result.normalized_status, "blocked");
  assert.ok(result.blockers.includes("missing_required_canonical_receipt:editorial_angle_receipt.v1"));
  assert.equal(result.warnings.some((warning) => warning.includes("missing_ceremonial_receipt_alias_accepted")), false);
});

test("draft-ready evidence passes when required canonical receipt aliases are present", () => {
  const result = classifyOwnedPublicEvidence({ ...baseDraft, ceremonial_receipts: requiredDraftReceipts });
  assert.equal(result.normalized_status, "draft_ready");
  assert.deepEqual(result.blockers, []);
});

test("quality gate failure blocks publish with status reason", () => {
  const result = classifyOwnedPublicEvidence({ ...baseDraft, quality_gate: { ok: false, failures: ["missing_x_copy"] } });
  assert.equal(result.normalized_status, "blocked");
  assert.equal(result.status_reason, "quality_gate_failed");
});

test("live graph-owned publish normalizes to published", () => {
  const result = classifyOwnedPublicEvidence({
    ...baseDraft,
    execution_mode: "live_owned_public",
    graph_owned_path: {
      node_invoked: true,
      graph_exit_code: 0,
      provider_mutation_performed: true,
      public_publish_performed: true,
      direct_parent_provider_mutation: false,
    },
  });
  assert.equal(result.status, "published_graph_owned");
  assert.equal(result.normalized_status, "published");
});

test("blocked auth blocks live publish only, draft still emits", () => {
  const draft = classifyOwnedPublicEvidence({ ...baseDraft, provider_auth_ok: false });
  assert.equal(draft.normalized_status, "draft_ready");
  assert.ok(draft.warnings.includes("provider_auth_missing_live_only"));
  const live = classifyOwnedPublicEvidence({ ...baseDraft, execution_mode: "live_owned_public", provider_auth_ok: false });
  assert.equal(live.normalized_status, "blocked");
  assert.equal(live.status_reason, "provider_auth_missing");
});

test("duplicate cadence blocks live publish only", () => {
  const draft = classifyOwnedPublicEvidence({ ...baseDraft, duplicate_or_cadence_hit: true });
  assert.equal(draft.normalized_status, "draft_ready");
  const live = classifyOwnedPublicEvidence({ ...baseDraft, execution_mode: "live_owned_public", duplicate_or_cadence_hit: true });
  assert.equal(live.normalized_status, "blocked");
  assert.equal(live.status_reason, "cadence_or_duplicate_block");
});

test("provider success without target id is closeout needs-review, not draft blocker", () => {
  const closeout = normalizeWorkflowStatus({ status: "published_graph_owned", provider_succeeded: true, target_url_or_id: null, mode: "post_publish_closeout" });
  assert.equal(closeout.normalized_status, "needs_review");
  assert.equal(closeout.status_reason, "missing_provider_target_id");
});

test("blocked auth wins over quality gate ok in normalization", () => {
  const result = normalizeWorkflowStatus({ status: "blocked_auth", quality_gate_ok: true, mode: "live_owned_public" });
  assert.equal(result.normalized_status, "blocked");
  assert.equal(result.status_reason, "provider_auth_missing");
});

test("published graph-owned normalizes to published", () => {
  const result = normalizeWorkflowStatus({ status: "published_graph_owned" });
  assert.equal(result.normalized_status, "published");
});

test("quality gate ok normalizes to draft_ready in draft context", () => {
  const result = normalizeWorkflowStatus({ quality_gate_ok: true, mode: "draft_ready" });
  assert.equal(result.normalized_status, "draft_ready");
});

test("graph preview cannot be satisfied by missing preview evidence", () => {
  const result = classifyOwnedPublicEvidence({ ...baseDraft, graph_owned_path: {} });
  assert.equal(result.normalized_status, "blocked");
  assert.ok(result.blockers.includes("graph_owned_preview_missing"));
});

test("owned-public preview treats workplane heartbeat gaps as warning-only", () => {
  const result = classifyOwnedPublicEvidence({
    ...baseDraft,
    graph_owned_path: { mutation_inputs_path: "/tmp/preview.json", blockers: ["workplane_status_unavailable", "heartbeat_missing"] },
  });
  assert.equal(result.normalized_status, "draft_ready");
  assert.deepEqual(result.blockers, []);
  assert.ok(result.warnings.includes("warning_only_graph_blocker:workplane_status_unavailable"));
});

test("visual alt_text alone is not ready", () => {
  assert.equal(visualReady({ alt_text: "image alt" }), false);
});

test("visual metadata triplet is ready", () => {
  assert.equal(visualReady({ png_sha256: `sha256:${"b".repeat(64)}`, kind: "chart", alt_text: "chart alt" }), true);
});

test("visual provider media id is ready", () => {
  assert.equal(visualReady({ provider_media_id: "media-123" }), true);
});
