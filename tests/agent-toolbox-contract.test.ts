import test from "node:test";
import assert from "node:assert/strict";

import {
  CHANNEL_HEAD_TOOLBOX_CONTRACTS,
  EXECUTION_MODES,
  PUBLIC_ARTIFACT_CHANNELS,
  buildAgentToolboxMatrix,
  buildTaskEnvelope,
  buildToolInheritanceReceipt,
  getAgentToolboxContract,
  isCanonicalAgentId,
  isCanonicalChannelHead,
  MEDIA_AGENT_TOOLBOX_MATRIX,
  buildMediaTaskEnvelope,
  buildMediaToolInheritanceReceipt,
  validateAgentDelegation,
  validateCanonicalMediaArtifact,
  validatePublicArtifactCandidate,
  validateTaskRouterReceipt,
  validateXPlatformFit,
} from "../src/lib/agent-toolbox-contract";
import {
  CANONICAL_DESIGN_BUNDLE_PATH,
  CANONICAL_DESIGN_MD_PATH,
  CANONICAL_DESIGN_PACK_LOGO_PATH,
  DESIGN_MEDIA_AGENT_IDS,
  FRONTEND_DESIGN_SKILL_PATH,
  REJECTED_ICON_ONLY_LOGO_PATH,
  buildAgentDesignSkillMatrix,
} from "../src/lib/design-bundle-enforcement";

const draftTools = [
  "shared-memory-read",
  "shared-memory-write",
  "artifact-writer",
  "schema-validator",
  "originality-check",
  "same-shit-check",
  "platform-fit-check",
];

test("non-canonical child IDs are blocked by delegation validation", () => {
  const result = validateAgentDelegation({
    parent_agent_id: "callscore-x-head",
    child_agent_id: "callscore-x-production-copy-child",
    requested_tools: draftTools,
    execution_mode: "draft_ready",
    artifact_type: "owned_post",
  });
  assert.equal(result.allowed, false);
  assert.match(result.blocked_reason ?? "", /non_canonical_child/);
});

test("non-canonical channel heads are rejected", () => {
  assert.equal(isCanonicalChannelHead("callscore-email-channel-head"), false);
  const result = validateAgentDelegation({
    parent_agent_id: "callscore-email-channel-head",
    child_agent_id: "callscore-reviewer-head",
    requested_tools: ["artifact-reader"],
    execution_mode: "read_only_verify",
    artifact_type: "review",
  });
  assert.equal(result.allowed, false);
  assert.match(result.blocked_reason ?? "", /non_canonical_parent/);
});

test("child output without task-router receipt cannot become canonical public artifact", () => {
  const result = validatePublicArtifactCandidate({
    channel: "x",
    artifact_type: "owned_post",
    generated_by_agent_id: "callscore-x-posting-agent",
    generated_by_parent_harness: false,
    task_router_receipt_id: null,
    tool_inheritance_receipt: buildToolInheritanceReceipt({
      parent_agent_id: "callscore-x-head",
      child_agent_id: "callscore-x-posting-agent",
      workflow_id: "wf05-x-owned-public",
      task_id: "task-1",
      execution_mode: "draft_ready",
      parent_tools_available: CHANNEL_HEAD_TOOLBOX_CONTRACTS["callscore-x-head"].delegable_tools_to_children,
      child_tools_requested: draftTools,
      skills_required: ["platform-native-copywriting"],
      task_router_receipt_id: "trr-1",
    }),
    receipts: [],
    public_text: "short clean post",
  });
  assert.equal(result.publish_candidate_ready, false);
  assert.match(result.blocked_reasons.join(" "), /missing_task_router_receipt/);
});

test("child output without tool inheritance receipt cannot become publish candidate", () => {
  const result = validatePublicArtifactCandidate({
    channel: "linkedin",
    artifact_type: "owned_post",
    generated_by_agent_id: "callscore-linkedin-posting-agent",
    generated_by_parent_harness: false,
    task_router_receipt_id: "trr-1",
    tool_inheritance_receipt: null,
    receipts: [],
    public_text: "A clean LinkedIn production candidate.",
  });
  assert.equal(result.canonical_public_artifact, false);
  assert.equal(result.publish_candidate_ready, false);
  assert.match(result.blocked_reasons.join(" "), /missing_tool_inheritance_receipt/);
});

test("draft-mode child cannot receive provider-public mutation tools", () => {
  const result = validateAgentDelegation({
    parent_agent_id: "callscore-x-head",
    child_agent_id: "callscore-x-posting-agent",
    requested_tools: [...draftTools, "provider-public-mutation"],
    execution_mode: "draft_ready",
    artifact_type: "owned_post",
  });
  assert.equal(result.allowed, false);
  assert.match(result.blocked_reason ?? "", /restricted_tool_in_mode/);
});

test("YouTube complete package cannot collapse into one generic YouTube child", () => {
  const result = validatePublicArtifactCandidate({
    channel: "youtube",
    artifact_type: "video_package",
    generated_by_agent_id: "callscore-youtube-head",
    generated_by_parent_harness: false,
    task_router_receipt_id: "trr-youtube",
    tool_inheritance_receipt: buildToolInheritanceReceipt({
      parent_agent_id: "callscore-youtube-head",
      child_agent_id: "callscore-youtube-head",
      workflow_id: "wf08-youtube-production",
      task_id: "task-youtube",
      execution_mode: "draft_ready",
      parent_tools_available: CHANNEL_HEAD_TOOLBOX_CONTRACTS["callscore-youtube-head"].delegable_tools_to_children,
      child_tools_requested: ["artifact-writer", "schema-validator"],
      skills_required: ["video-scriptwriting"],
      task_router_receipt_id: "trr-youtube",
    }),
    receipts: ["youtube_script_receipt.v1"],
    public_text: "Video package",
  });
  assert.equal(result.publish_candidate_ready, false);
  assert.match(result.blocked_reasons.join(" "), /youtube_cluster_incomplete/);
});

test("parent media renderer cannot be marked as visual-agent output", () => {
  const result = validatePublicArtifactCandidate({
    channel: "x",
    artifact_type: "visual_asset",
    generated_by_agent_id: "callscore-x-image-agent",
    generated_by_parent_harness: true,
    task_router_receipt_id: "trr-visual",
    tool_inheritance_receipt: buildToolInheritanceReceipt({
      parent_agent_id: "callscore-x-head",
      child_agent_id: "callscore-x-image-agent",
      workflow_id: "wf05-x-owned-public",
      task_id: "task-image",
      execution_mode: "draft_ready",
      parent_tools_available: CHANNEL_HEAD_TOOLBOX_CONTRACTS["callscore-x-head"].delegable_tools_to_children,
      child_tools_requested: ["artifact-writer", "visual-proof-object-designer", "visual-qa", "copy-visual-coherence-check"],
      skills_required: ["visual-proof-object-design", "visual-qa"],
      task_router_receipt_id: "trr-visual",
    }),
    receipts: ["visual_brief_receipt.v1", "visual_qa_receipt.v1", "copy_visual_coherence_receipt.v1"],
    public_text: "Visual asset",
  });
  assert.equal(result.canonical_public_artifact, false);
  assert.match(result.blocked_reasons.join(" "), /parent_harness_generated_media/);
});

test("X platform-fit enforces 280 character limit unless explicit long-form mode", () => {
  const longText = "x".repeat(281);
  assert.equal(validateXPlatformFit({ text: longText, mode: "owned_post" }).allowed, false);
  assert.equal(validateXPlatformFit({ text: longText, mode: "long_form_thread" }).allowed, true);
});

test("task-router happy path lets X head route to X posting agent with allowed draft tools", () => {
  const envelope = buildTaskEnvelope({
    task_id: "task-x-1",
    workflow_id: "wf05-x-owned-public",
    parent_agent_id: "callscore-x-head",
    target_agent_id: "callscore-x-posting-agent",
    channel: "x",
    artifact_type: "owned_post",
    objective: "Draft X-native owned public post from existing evidence packet.",
    input_refs: ["artifact://evidence-packet"],
    memory_query: "recent x post hashes",
    required_tools: draftTools,
    required_skills: ["platform-native-copywriting", "originality-review"],
    output_schema: "callscore.x_owned_post_candidate.v1",
    expected_receipts: ["platform_fit_receipt.v1", "same_shit_memory_receipt.v1"],
    execution_mode: "draft_ready",
  });
  const receipt = validateAgentDelegation({
    parent_agent_id: envelope.parent_agent_id,
    child_agent_id: envelope.target_agent_id,
    requested_tools: envelope.required_tools,
    execution_mode: envelope.execution_mode,
    artifact_type: envelope.artifact_type,
  });
  assert.equal(receipt.allowed, true);
  assert.equal(validateTaskRouterReceipt(receipt.routing_receipt).allowed, true);
});

test("tool inheritance happy path grants LinkedIn posting agent only allowed draft tools", () => {
  const receipt = buildToolInheritanceReceipt({
    parent_agent_id: "callscore-linkedin-head",
    child_agent_id: "callscore-linkedin-posting-agent",
    workflow_id: "wf06-linkedin-owned-public",
    task_id: "task-linkedin-1",
    execution_mode: "draft_ready",
    parent_tools_available: CHANNEL_HEAD_TOOLBOX_CONTRACTS["callscore-linkedin-head"].delegable_tools_to_children,
    child_tools_requested: ["shared-memory-read", "shared-memory-write", "artifact-writer", "schema-validator", "platform-fit-check"],
    skills_required: ["long-form-thought-leadership", "platform-fit-validation"],
    task_router_receipt_id: "trr-linkedin-1",
  });
  assert.equal(receipt.status, "granted");
  assert.deepEqual(receipt.child_tools_denied, []);
});

test("Community, Whop, and Email heads cannot receive send/customer mutation tools in draft mode", () => {
  for (const parent_agent_id of [
    "callscore-community-drops-head",
    "callscore-whop-commerce-head",
    "callscore-email-partnership-drafts-head",
  ]) {
    const result = validateAgentDelegation({
      parent_agent_id,
      child_agent_id: "callscore-reviewer-head",
      requested_tools: ["artifact-reader", "external-send", "customer-payment-entitlement-mutation"],
      execution_mode: "draft_ready",
      artifact_type: "review",
    });
    assert.equal(result.allowed, false, parent_agent_id);
    assert.match(result.blocked_reason ?? "", /restricted_tool_in_mode/);
  }
});

test("existing canonical route maps pass against the 51-agent toolbox matrix", () => {
  assert.deepEqual(EXECUTION_MODES, ["read_only_verify", "draft_ready", "live_owned_public", "post_publish_closeout"]);
  assert.deepEqual(PUBLIC_ARTIFACT_CHANNELS, ["x", "linkedin", "reddit", "youtube", "community", "whop", "email"]);
  const matrix = buildAgentToolboxMatrix();
  assert.equal(matrix.length, 51);
  assert.equal(matrix.filter((row) => row.canonical_51).length, 51);
  for (const head of Object.keys(CHANNEL_HEAD_TOOLBOX_CONTRACTS)) {
    const contract = getAgentToolboxContract(head);
    assert.ok(contract, `${head} must have toolbox contract`);
    assert.equal(isCanonicalAgentId(head), true, `${head} must be canonical`);
    assert.equal(contract?.task_router_access, "required");
    assert.equal(contract?.workplane_claim_access, "required");
    assert.notEqual(contract?.status, "unknown");
  }
});

function validMediaArtifact(overrides: Record<string, unknown> = {}) {
  const envelope = buildMediaTaskEnvelope({
    task_id: "media-task-1",
    workflow_id: "wf05-x-owned-public",
    parent_agent_id: "callscore-x-head",
    target_agent_id: "callscore-x-image-agent",
    channel: "x",
    media_type: "image",
    objective: "Create X proof-object image from visual brief.",
    source_artifact_refs: ["artifact://copy"],
    source_evidence_refs: ["artifact://evidence"],
    copy_context_refs: ["artifact://copy"],
    visual_brief_ref: "receipt://visual_brief_receipt.v1",
    platform_constraints: { dimensions: "1200x675", max_file_size: "5MB", format: "png" },
    required_tools: ["visual-proof-object-designer", "visual-layout-spec-writer", "svg-renderer", "png-rasterizer", "visual-qa"],
    output_schema: "callscore.media_artifact.v1",
    execution_mode: "draft_ready",
  });
  const inheritance = buildMediaToolInheritanceReceipt({
    task_id: "media-task-1",
    parent_agent_id: "callscore-x-head",
    media_agent_id: "callscore-x-image-agent",
    workflow_id: "wf05-x-owned-public",
    channel: "x",
    media_type: "image",
    requested_tools: envelope.required_tools,
    execution_mode: "draft_ready",
    tool_versions: { "png-rasterizer": "ffmpeg-local" },
  });
  const designReceipt = {
    schema: "callscore.design_bundle_reference_receipt.v1" as const,
    workflow_id: "wf05-x-owned-public",
    agent_id: "callscore-x-image-agent",
    channel: "x",
    artifact_id: "artifact-1",
    media_task_id: "media-task-1",
    design_bundle_path: CANONICAL_DESIGN_BUNDLE_PATH,
    design_bundle_sha256: "b".repeat(64),
    design_md_path: CANONICAL_DESIGN_MD_PATH,
    design_md_sha256: "c".repeat(64),
    canonical_logo_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    canonical_logo_sha256: "e".repeat(64),
    example_images_used_as_reference: [],
    frontend_design_skill_path: FRONTEND_DESIGN_SKILL_PATH,
    frontend_design_skill_sha256: "d".repeat(64),
    loaded_before_generation: true,
    content_reference_mode: "paths_ids_hashes_only",
    created_at_utc: new Date().toISOString(),
  };
  const alignmentReceipt = {
    schema: "callscore.website_design_alignment_receipt.v1" as const,
    workflow_id: "wf05-x-owned-public",
    agent_id: "callscore-x-image-agent",
    channel: "x",
    artifact_id: "artifact-1",
    media_artifact_id: "media-1",
    final_media_path: "card.png",
    final_media_sha256: "a".repeat(64),
    design_bundle_reference_receipt_id: "design-ref-1",
    checks: {
      uses_editorial_terminal_style: true,
      uses_ink_surface_ramp: true,
      uses_sparse_ochre_accent: true,
      uses_serif_editorial_hierarchy: true,
      uses_mono_numeric_evidence_layers: true,
      uses_rectangular_panels: true,
      uses_1px_hairlines: true,
      uses_provenance_evidence_hierarchy: true,
      avoids_generic_saas_card: true,
      avoids_neon_crypto_cliche: true,
      avoids_ai_gloss: true,
      avoids_old_noncanonical_style: true,
    },
    style_failures: [],
    status: "passed" as const,
    created_at_utc: new Date().toISOString(),
  };
  const brandingReceipt = {
    schema: "callscore.branding_receipt.v2" as const,
    channel: "x",
    artifact_id: "artifact-1",
    media_artifact_id: "media-1",
    branding_applied: true,
    brand_asset_source: "canonical_design_pack",
    brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    brand_asset_sha256: "e".repeat(64),
    placement: "top_right",
    top_right_brand_crop_path: "crop.png",
    top_right_brand_crop_sha256: "f".repeat(64),
    top_right_brand_crop_visible: true,
    final_media_path: "card.png",
    final_media_sha256: "a".repeat(64),
    created_by_agent_id: "callscore-x-image-agent",
    channel_head_agent_id: "callscore-x-head",
    parent_harness_rendered: false,
    hardcoded_brand_text_used: false,
    fallback_wordmark_used: false,
    fallback_icon_only_logo_used: false,
    brand_lockup_safe_zone_clear: true,
    brand_lockup_occlusion_free: true,
    no_hairline_intersects_brand: true,
    tagline_readable: true,
    logo_not_clipped: true,
    brand_lockup_occlusion_check: {
      schema: "callscore.brand_lockup_occlusion_check.v1" as const,
      status: "passed" as const,
      media_path: "card.png",
      media_sha256: "a".repeat(64),
      brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
      brand_asset_sha256: "e".repeat(64),
      brand_bbox: [1296, 72, 196, 80],
      brand_safe_zone_bbox: [1272, 48, 244, 128],
      intersecting_line_segments: [],
      intersecting_borders: [],
      intersecting_visual_elements: [],
      min_clearance_px: 32,
      required_min_clearance_px: 24,
      preferred_clearance_px: 32,
      top_right_crop_path: "crop.png",
      debug_overlay_path: "debug.png",
      brand_lockup_present: true,
      brand_lockup_position: "top_right",
      brand_lockup_safe_zone_clear: true,
      brand_lockup_occlusion_free: true,
      no_hairline_intersects_brand: true,
      tagline_readable: true,
      logo_not_clipped: true,
      pass: true,
    },
    content_reference_mode: "paths_ids_hashes_only",
    created_at_utc: new Date().toISOString(),
  };
  return {
    schema: "callscore.media_artifact_receipt.v1" as const,
    artifact_id: "artifact-1",
    media_artifact_id: "media-1",
    created_by_agent_id: "callscore-x-image-agent",
    channel_head_agent_id: "callscore-x-head",
    workflow_id: "wf05-x-owned-public",
    media_type: "image",
    source_copy_artifact_id: "copy-1",
    source_visual_brief_id: "visual-brief-1",
    source_evidence_paths: ["evidence.json"],
    media_task_envelope: envelope,
    media_tool_inheritance_receipt: inheritance,
    tool_inheritance_receipt_id: "media-inheritance-1",
    tools_used: ["visual-proof-object-designer", "visual-layout-spec-writer", "svg-renderer", "png-rasterizer", "visual-qa"],
    renderer_used: "png-rasterizer",
    input_spec_path: "visual-spec.json",
    output_paths: ["card.png"],
    mime_type: "image/png",
    dimensions: { width: 1200, height: 675 },
    duration_seconds: null,
    codec: null,
    file_size_bytes: 120_000,
    sha256: "a".repeat(64),
    alt_text: "Receipt-backed proof-object media artifact.",
    visual_qa_receipt_id: "visual-qa-1",
    copy_visual_coherence_receipt_id: "copy-visual-1",
    design_bundle_reference_receipt: designReceipt,
    website_design_alignment_receipt: alignmentReceipt,
    branding_receipt: brandingReceipt,
    visual_proof_object_present: true,
    hardcoded_runtime_media: false,
    parent_harness_rendered: false,
    status: "ready" as const,
    ...overrides,
  };
}

test("parent PNG render is blocked as canonical media", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ parent_harness_rendered: true }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /parent_harness_rendered/);
});

test("parent MP4 render is blocked as YouTube canonical media", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    channel_head_agent_id: "callscore-youtube-head",
    created_by_agent_id: "callscore-youtube-publishing-agent",
    media_type: "video_preview",
    mime_type: "video/mp4",
    output_paths: ["preview.mp4"],
    dimensions: { width: 1920, height: 1080 },
    duration_seconds: 12,
    codec: "h264/mp4",
    parent_harness_rendered: true,
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /parent_harness_rendered/);
});

test("missing media tool inheritance blocks canonical media", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ media_tool_inheritance_receipt: null }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /missing_media_tool_inheritance_receipt/);
});

test("wrong media owner blocked for X images", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ created_by_agent_id: "callscore-x-head" }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /wrong_media_owner/);
});

test("YouTube thumbnail owner is enforced", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    channel_head_agent_id: "callscore-youtube-head",
    created_by_agent_id: "callscore-youtube-packaging-agent",
    media_type: "thumbnail",
    mime_type: "image/png",
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /wrong_media_owner/);
});

test("YouTube media package requires the full production cluster receipts", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    channel_head_agent_id: "callscore-youtube-head",
    created_by_agent_id: "callscore-youtube-publishing-agent",
    media_type: "video_package",
    mime_type: "video/mp4",
    output_paths: ["preview.mp4"],
    duration_seconds: 12,
    codec: "h264/mp4",
    youtube_cluster_receipts: ["youtube_script_receipt.v1", "youtube_packaging_receipt.v1"],
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /youtube_cluster_media_receipts_incomplete/);
});

test("real renderer is required and parent_script renderer fails", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ renderer_used: "parent_script" }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /invalid_renderer/);
});

test("dimensions, MIME, file size, hash, and video codec metadata are required", () => {
  const image = validateCanonicalMediaArtifact(validMediaArtifact({ dimensions: { width: 0, height: 0 }, sha256: "" }));
  assert.equal(image.canonical_media_valid, false);
  assert.match(image.failure_reasons.join(" "), /missing_dimensions/);
  assert.match(image.failure_reasons.join(" "), /missing_sha256/);

  const video = validateCanonicalMediaArtifact(validMediaArtifact({
    channel_head_agent_id: "callscore-youtube-head",
    created_by_agent_id: "callscore-youtube-publishing-agent",
    media_type: "video_preview",
    mime_type: "video/mp4",
    output_paths: ["preview.mp4"],
    duration_seconds: null,
    codec: null,
  }));
  assert.equal(video.canonical_media_valid, false);
  assert.match(video.failure_reasons.join(" "), /missing_video_duration/);
  assert.match(video.failure_reasons.join(" "), /missing_video_codec/);
});

test("visual proof object is required; generic headline cards fail visual QA", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ visual_proof_object_present: false }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /missing_visual_proof_object/);
});

test("draft-ready media can write local files but cannot use provider/public mutation", () => {
  const xImage = MEDIA_AGENT_TOOLBOX_MATRIX["callscore-x-image-agent"];
  assert.equal(xImage.may_render_files, true);
  assert.equal(xImage.may_call_provider_media_tool, false);
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ tools_used: ["png-rasterizer", "provider-public-mutation"] }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /provider_public_mutation_forbidden/);
});


test("every design/image/video/media agent has frontend-design access", () => {
  const matrix = buildAgentDesignSkillMatrix();
  assert.equal(matrix.length, DESIGN_MEDIA_AGENT_IDS.length);
  for (const row of matrix) {
    assert.equal(row.canonical_51, true, row.agent_id);
    assert.equal(row.uses_frontend_design_skill, true, row.agent_id);
    assert.equal(row.design_bundle_path, CANONICAL_DESIGN_BUNDLE_PATH, row.agent_id);
    assert.equal(row.design_md_path, CANONICAL_DESIGN_MD_PATH, row.agent_id);
    assert.ok(row.required_receipts.includes("callscore.design_bundle_reference_receipt.v1"), row.agent_id);
    assert.ok(row.required_receipts.includes("callscore.website_design_alignment_receipt.v1"), row.agent_id);
  }
});

test("X and LinkedIn creation agents can access frontend-design and image agents render", () => {
  const byId = new Map(buildAgentDesignSkillMatrix().map((row) => [row.agent_id, row]));
  assert.equal(byId.get("callscore-x-posting-agent")?.may_write_visual_brief, true);
  assert.equal(byId.get("callscore-x-posting-agent")?.may_render_final_media, false);
  assert.equal(byId.get("callscore-x-image-agent")?.may_render_final_media, true);
  assert.equal(byId.get("callscore-linkedin-posting-agent")?.may_write_visual_brief, true);
  assert.equal(byId.get("callscore-linkedin-posting-agent")?.may_render_final_media, false);
  assert.equal(byId.get("callscore-linkedin-image-agent")?.may_render_final_media, true);
});

test("production media without design bundle reference receipt fails", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ design_bundle_reference_receipt: null }));
  assert.equal(result.canonical_media_valid, false);
  assert.equal(result.status, "blocked_incomplete_canonical_design_pack");
  assert.match(result.failure_reasons.join(" "), /missing_design_bundle_reference_receipt/);
});

test("production media without design-pack logo fails", () => {
  const artifact = validMediaArtifact();
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    design_bundle_reference_receipt: {
      ...artifact.design_bundle_reference_receipt,
      canonical_logo_path: "",
      canonical_logo_sha256: "",
    },
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.equal(result.status, "blocked_incomplete_canonical_design_pack");
  assert.match(result.failure_reasons.join(" "), /wrong_canonical_logo_path|missing_canonical_logo_sha256/);
});

test("production media with arbitrary logo path fails", () => {
  const artifact = validMediaArtifact();
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    branding_receipt: {
      ...artifact.branding_receipt,
      brand_asset_path: "/tmp/other-logo.png",
    },
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.equal(result.status, "blocked_brand_lockup_missing");
  assert.match(result.failure_reasons.join(" "), /wrong_brand_asset_path/);
});

test("production media with icon-only logo path fails", () => {
  const artifact = validMediaArtifact();
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    design_bundle_reference_receipt: {
      ...artifact.design_bundle_reference_receipt,
      canonical_logo_path: REJECTED_ICON_ONLY_LOGO_PATH,
    },
    branding_receipt: {
      ...artifact.branding_receipt,
      brand_asset_path: REJECTED_ICON_ONLY_LOGO_PATH,
      fallback_icon_only_logo_used: true,
    },
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /icon_only_logo_rejected/);
});

test("production media with fallback wordmark fails", () => {
  const artifact = validMediaArtifact();
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    branding_receipt: {
      ...artifact.branding_receipt,
      hardcoded_brand_text_used: true,
      fallback_wordmark_used: true,
    },
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.equal(result.status, "blocked_brand_lockup_missing");
  assert.match(result.failure_reasons.join(" "), /fallback_wordmark_used|hardcoded_brand_text_used/);
});

test("production media without visible top-right lockup crop fails", () => {
  const artifact = validMediaArtifact();
  const result = validateCanonicalMediaArtifact(validMediaArtifact({
    branding_receipt: {
      ...artifact.branding_receipt,
      top_right_brand_crop_visible: false,
      top_right_brand_crop_sha256: "",
    },
  }));
  assert.equal(result.canonical_media_valid, false);
  assert.equal(result.status, "blocked_brand_lockup_missing");
  assert.match(result.failure_reasons.join(" "), /top_right_brand_crop_not_visible|missing_top_right_brand_crop_sha256/);
});

test("production media with design-pack logo passes if all other gates pass", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact());
  assert.equal(result.canonical_media_valid, true);
  assert.equal(result.publish_candidate_ready, true);
  assert.equal(result.status, "passed");
});

test("production media without website design alignment receipt fails", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ website_design_alignment_receipt: null }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /missing_website_design_alignment_receipt/);
});

test("generic old-style proof-object-free visual fails even with bundle receipt", () => {
  const result = validateCanonicalMediaArtifact(validMediaArtifact({ visual_proof_object_present: false }));
  assert.equal(result.canonical_media_valid, false);
  assert.match(result.failure_reasons.join(" "), /old_style_or_proof_object_free_visual_rejected|missing_visual_proof_object/);
});

test("media task envelope carries canonical design bundle and receipt requirements", () => {
  const envelope = buildMediaTaskEnvelope({
    task_id: "media-task-design",
    workflow_id: "wf-design",
    parent_agent_id: "callscore-x-head",
    target_agent_id: "callscore-x-image-agent",
    channel: "x",
    media_type: "image",
    objective: "Create canonical design-aligned proof object.",
    source_artifact_refs: [],
    source_evidence_refs: [],
    copy_context_refs: [],
    visual_brief_ref: "receipt://visual_brief_receipt.v1",
    platform_constraints: { dimensions: "1600x900", max_file_size: "5MB", format: "png" },
    required_tools: ["visual-proof-object-designer"],
    output_schema: "callscore.media_artifact.v1",
    execution_mode: "draft_ready",
  });
  assert.equal(envelope.design_bundle_path, CANONICAL_DESIGN_BUNDLE_PATH);
  assert.equal(envelope.frontend_design_skill_path, FRONTEND_DESIGN_SKILL_PATH);
  assert.ok(envelope.required_skills.includes("frontend-design"));
  assert.ok(envelope.required_receipts.includes("callscore.design_bundle_reference_receipt.v1"));
  assert.ok(envelope.required_receipts.includes("callscore.website_design_alignment_receipt.v1"));
  assert.equal(envelope.content_reference_mode, "paths_ids_hashes_only");
  assert.equal(envelope.mutation_allowed, false);
});

test("media tool inheritance grants frontend-design and never parent harness render ownership", () => {
  const receipt = buildMediaToolInheritanceReceipt({
    task_id: "media-task-design",
    parent_agent_id: "callscore-x-head",
    media_agent_id: "callscore-x-image-agent",
    workflow_id: "wf-design",
    channel: "x",
    media_type: "image",
    requested_tools: ["visual-proof-object-designer", "visual-qa"],
    tool_versions: {},
    execution_mode: "draft_ready",
  });
  assert.equal(receipt.frontend_design_granted, true);
  assert.equal(receipt.design_bundle_read_access_granted, true);
  assert.equal(receipt.parent_harness_render_tools_granted, false);
  assert.equal(receipt.provider_public_mutation_allowed, false);
});

test("YouTube cluster design test requires design receipts for thumbnail/video package", () => {
  const thumbnail = validateCanonicalMediaArtifact(validMediaArtifact({
    channel_head_agent_id: "callscore-youtube-head",
    created_by_agent_id: "callscore-youtube-thumbnail-agent",
    media_type: "thumbnail",
    youtube_cluster_receipts: ["youtube_script_receipt.v1", "youtube_packaging_receipt.v1", "youtube_thumbnail_receipt.v1", "youtube_publish_package_receipt.v1", "youtube_commenting_receipt.v1", "youtube_analytics_receipt.v1"],
    design_bundle_reference_receipt: null,
  }));
  assert.equal(thumbnail.canonical_media_valid, false);
  assert.match(thumbnail.failure_reasons.join(" "), /missing_design_bundle_reference_receipt/);
});
