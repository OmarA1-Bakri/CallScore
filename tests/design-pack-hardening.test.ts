import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  validateCanonicalMediaArtifact,
} from "../src/lib/agent-toolbox-contract";
import {
  CANONICAL_DESIGN_BUNDLE_PATH,
  CANONICAL_DESIGN_MD_PATH,
  CANONICAL_DESIGN_PACK_LOGO_PATH,
  REJECTED_ICON_ONLY_LOGO_PATH,
  validateBrandLockupOcclusionCheck,
} from "../src/lib/design-bundle-enforcement";

const repoRoot = "/opt/crypto-tuber-ranked";
const websiteLogoPath = join(repoRoot, "public/brand/callscore-lockup-transparent.png");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validBranding(overrides: Record<string, unknown> = {}) {
  const occlusionCheck = validBrandOcclusionCheck();
  return {
    schema: "callscore.branding_receipt.v2" as const,
    channel: "x",
    artifact_id: "artifact-1",
    media_artifact_id: "media-1",
    branding_applied: true,
    brand_asset_source: "canonical_design_pack",
    brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    brand_asset_sha256: "1".repeat(64),
    placement: "top_right",
    top_right_brand_crop_path: "crop.png",
    top_right_brand_crop_sha256: "2".repeat(64),
    top_right_brand_crop_visible: true,
    final_media_path: "card.png",
    final_media_sha256: "3".repeat(64),
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
    brand_lockup_occlusion_check: occlusionCheck,
    content_reference_mode: "paths_ids_hashes_only",
    created_at_utc: new Date().toISOString(),
    ...overrides,
  };
}

function validBrandOcclusionCheck(overrides: Record<string, unknown> = {}) {
  return {
    schema: "callscore.brand_lockup_occlusion_check.v1" as const,
    status: "passed" as const,
    media_path: "card.png",
    media_sha256: "3".repeat(64),
    brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    brand_asset_sha256: "1".repeat(64),
    brand_bbox: [1296, 72, 196, 80],
    brand_safe_zone_bbox: [1264, 40, 260, 144],
    intersecting_line_segments: [],
    intersecting_borders: [],
    intersecting_visual_elements: [],
    min_clearance_px: 32,
    required_min_clearance_px: 24,
    preferred_clearance_px: 32,
    top_right_crop_path: "crop.png",
    debug_overlay_path: "debug.png",
    brand_lockup_present: true,
    brand_lockup_position: "top_right" as const,
    brand_lockup_safe_zone_clear: true,
    brand_lockup_occlusion_free: true,
    no_hairline_intersects_brand: true,
    tagline_readable: true,
    logo_not_clipped: true,
    pass: true,
    ...overrides,
  };
}

function validMedia(overrides: Record<string, unknown> = {}) {
  const branding = validBranding();
  return ({
    schema: "callscore.media_artifact_receipt.v2" as const,
    artifact_id: "artifact-1",
    media_artifact_id: "media-1",
    created_by_agent_id: "callscore-x-image-agent",
    channel_head_agent_id: "callscore-x-head",
    workflow_id: "wf-design-hardening",
    media_type: "image",
    source_copy_artifact_id: null,
    source_visual_brief_id: "visual-brief.json",
    source_evidence_paths: [CANONICAL_DESIGN_MD_PATH],
    media_task_envelope: { schema: "callscore.media_task_envelope.v1" },
    media_tool_inheritance_receipt: { schema: "callscore.media_tool_inheritance_receipt.v1", status: "granted" },
    tool_inheritance_receipt_id: "inheritance.json",
    tools_used: ["png-rasterizer", "visual-qa"],
    renderer_used: "png-rasterizer",
    input_spec_path: "spec.json",
    output_paths: ["card.png"],
    mime_type: "image/png",
    dimensions: { width: 1200, height: 675 },
    duration_seconds: null,
    codec: null,
    file_size_bytes: 1000,
    sha256: "3".repeat(64),
    alt_text: "Receipt-backed design-pack verification visual.",
    visual_qa_receipt_id: "visual-qa.json",
    copy_visual_coherence_receipt_id: null,
    design_bundle_reference_receipt: {
      schema: "callscore.design_bundle_reference_receipt.v1" as const,
      workflow_id: "wf-design-hardening",
      agent_id: "callscore-x-image-agent",
      channel: "x",
      artifact_id: "artifact-1",
      media_task_id: "media-task-1",
      design_bundle_path: CANONICAL_DESIGN_BUNDLE_PATH,
      design_md_path: CANONICAL_DESIGN_MD_PATH,
      design_md_sha256: "4".repeat(64),
      canonical_logo_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
      canonical_logo_sha256: "1".repeat(64),
      example_images_used_as_reference: [],
      frontend_design_skill_path: "/srv/agents/hermes/profiles/callscore/skills/toby-frontend-design-pro/SKILL.md",
      loaded_before_generation: true,
      content_reference_mode: "paths_ids_hashes_only",
      created_at_utc: new Date().toISOString(),
    },
    website_design_alignment_receipt: {
      schema: "callscore.website_design_alignment_receipt.v1" as const,
      workflow_id: "wf-design-hardening",
      agent_id: "callscore-x-image-agent",
      channel: "x",
      artifact_id: "artifact-1",
      media_artifact_id: "media-1",
      final_media_path: "card.png",
      final_media_sha256: "3".repeat(64),
      design_bundle_reference_receipt_id: "design-ref.json",
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
    },
    branding_receipt: branding,
    brand_lockup_occlusion_check: branding.brand_lockup_occlusion_check,
    visual_proof_object_present: true,
    hardcoded_runtime_media: false,
    parent_harness_rendered: false,
    status: "ready" as const,
    ...overrides,
  }) as any;
}

test("canonical design pack contains DESIGN.md, logo, manifests, and SHA256SUMS", () => {
  const required = [
    CANONICAL_DESIGN_MD_PATH,
    CANONICAL_DESIGN_PACK_LOGO_PATH,
    join(CANONICAL_DESIGN_BUNDLE_PATH, "assets/callscore_design_system_reference_guide.png"),
    join(CANONICAL_DESIGN_BUNDLE_PATH, "assets/design_system_documentation_overview.png"),
    join(CANONICAL_DESIGN_BUNDLE_PATH, "source-manifest/new_fe_design_source_manifest.json"),
    join(CANONICAL_DESIGN_BUNDLE_PATH, "source-manifest/source-files.txt"),
    join(CANONICAL_DESIGN_BUNDLE_PATH, "design-pack-manifest.json"),
    join(CANONICAL_DESIGN_BUNDLE_PATH, "SHA256SUMS"),
  ];
  for (const path of required) assert.equal(existsSync(path), true, path);
  const sums = readFileSync(join(CANONICAL_DESIGN_BUNDLE_PATH, "SHA256SUMS"), "utf8");
  assert.match(sums, /DESIGN\.md/);
  assert.match(sums, /assets\/callscore-lockup-transparent\.png/);
});

test("design-pack logo is copied from website-proven canonical lockup and icon-only asset is rejected", () => {
  assert.equal(sha256(CANONICAL_DESIGN_PACK_LOGO_PATH), sha256(websiteLogoPath));
  const brandComponent = readFileSync(join(repoRoot, "src/components/CallScoreBrand.tsx"), "utf8");
  const header = readFileSync(join(repoRoot, "src/components/Header.tsx"), "utf8");
  assert.match(brandComponent, /\/brand\/callscore-lockup-transparent\.png/);
  assert.match(header, /CallScoreBrand/);
  assert.notEqual(sha256(REJECTED_ICON_ONLY_LOGO_PATH), sha256(CANONICAL_DESIGN_PACK_LOGO_PATH));
});

test("media validation blocks missing logo, arbitrary logo, fallback wordmark, parent harness, and missing crop", () => {
  assert.equal(validateCanonicalMediaArtifact(validMedia()).canonical_media_valid, true);
  assert.equal(validateCanonicalMediaArtifact(validMedia({ design_bundle_reference_receipt: null })).status, "blocked_incomplete_canonical_design_pack");
  assert.equal(validateCanonicalMediaArtifact(validMedia({ branding_receipt: validBranding({ brand_asset_path: "/tmp/not-canonical.png" }) })).status, "blocked_brand_lockup_missing");
  assert.equal(validateCanonicalMediaArtifact(validMedia({ branding_receipt: validBranding({ fallback_wordmark_used: true, hardcoded_brand_text_used: true }) })).status, "blocked_brand_lockup_missing");
  assert.equal(validateCanonicalMediaArtifact(validMedia({ parent_harness_rendered: true, branding_receipt: validBranding({ parent_harness_rendered: true }) })).canonical_media_valid, false);
  assert.equal(validateCanonicalMediaArtifact(validMedia({ branding_receipt: validBranding({ top_right_brand_crop_visible: false, top_right_brand_crop_sha256: "" }) })).status, "blocked_brand_lockup_missing");
});

test("brand lockup occlusion check fails when a divider intersects the brand safe zone", () => {
  const oldFailure = validBrandOcclusionCheck({
    status: "failed",
    intersecting_line_segments: [{ id: "header-hairline", x1: 104, y1: 142, x2: 1496, y2: 142 }],
    min_clearance_px: 0,
    brand_lockup_safe_zone_clear: false,
    brand_lockup_occlusion_free: false,
    no_hairline_intersects_brand: false,
    pass: false,
  });
  const failures = validateBrandLockupOcclusionCheck(oldFailure);
  assert.match(failures.join(","), /brand_lockup_safe_zone_intersected/);
  assert.equal(validateCanonicalMediaArtifact(validMedia({ branding_receipt: validBranding({ brand_lockup_occlusion_check: oldFailure }) })).status, "blocked_brand_lockup_missing");
});

test("brand lockup safe-zone clear passes when hairline stops before the safe zone", () => {
  const safe = validBrandOcclusionCheck({
    intersecting_line_segments: [],
    min_clearance_px: 32,
    pass: true,
  });
  assert.deepEqual(validateBrandLockupOcclusionCheck(safe), []);
  assert.equal(validateCanonicalMediaArtifact(validMedia({ branding_receipt: validBranding({ brand_lockup_occlusion_check: safe }) })).canonical_media_valid, true);
});

test("tagline or letterform crossed by line fails lockup validation", () => {
  const crossed = validBrandOcclusionCheck({
    status: "failed",
    intersecting_visual_elements: [{ id: "tagline", reason: "line crosses tagline area" }],
    tagline_readable: false,
    no_hairline_intersects_brand: false,
    pass: false,
  });
  const failures = validateBrandLockupOcclusionCheck(crossed);
  assert.match(failures.join(","), /tagline_not_readable/);
});

test("public media readiness requires brand lockup occlusion check", () => {
  const result = validateCanonicalMediaArtifact(validMedia({
    brand_lockup_occlusion_check: null,
    branding_receipt: validBranding({ brand_lockup_occlusion_check: null }),
  }));
  assert.equal(result.status, "blocked_brand_lockup_missing");
  assert.match(result.failure_reasons.join(","), /missing_brand_lockup_occlusion_check/);
});

test("hardcoding guard fixture has no public payload literals or logo data embeddings", () => {
  const touched = [
    "src/lib/design-bundle-enforcement.ts",
    "src/lib/agent-toolbox-contract.ts",
    "src/scripts/callscore-design-media-canary.ts",
    "tests/agent-toolbox-contract.test.ts",
    "tests/design-pack-hardening.test.ts",
  ];
  const forbidden = [/data:image\/png;base64/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  for (const rel of touched) {
    const text = readFileSync(join(repoRoot, rel), "utf8");
    for (const pattern of forbidden) assert.doesNotMatch(text, pattern, rel);
  }
});
