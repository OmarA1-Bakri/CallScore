export const CANONICAL_DESIGN_BUNDLE_PATH = "/srv/agents/hermes/profiles/callscore/design/callscore_design_md_bundle/" as const;
export const CANONICAL_DESIGN_MD_PATH = "/srv/agents/hermes/profiles/callscore/design/callscore_design_md_bundle/DESIGN.md" as const;
export const CANONICAL_DESIGN_PACK_LOGO_PATH = "/srv/agents/hermes/profiles/callscore/design/callscore_design_md_bundle/assets/callscore-lockup-transparent.png" as const;
export const REJECTED_ICON_ONLY_LOGO_PATH = "/opt/crypto-tuber-ranked/public/logo-icon.png" as const;
export const FRONTEND_DESIGN_SKILL_PATH = "/srv/agents/hermes/profiles/callscore/skills/toby-frontend-design-pro/SKILL.md" as const;
export const BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX = 24 as const;
export const BRAND_LOCKUP_PREFERRED_CLEARANCE_PX = 32 as const;
export const REQUIRED_DESIGN_RECEIPTS = ["callscore.design_bundle_reference_receipt.v1", "callscore.website_design_alignment_receipt.v1", "callscore.branding_receipt.v2", "callscore.brand_lockup_occlusion_check.v1"] as const;
export const REQUIRED_DESIGN_SKILLS = ["frontend-design"] as const;

export const DESIGN_MEDIA_AGENT_IDS = ["callscore-x-image-agent", "callscore-x-posting-agent", "callscore-x-head", "callscore-linkedin-image-agent", "callscore-linkedin-posting-agent", "callscore-linkedin-head", "callscore-reddit-image-agent", "callscore-reddit-posting-agent", "callscore-reddit-head", "callscore-community-drops-head", "callscore-whop-commerce-head", "callscore-email-partnership-drafts-head", "callscore-youtube-head", "callscore-youtube-script-agent", "callscore-youtube-packaging-agent", "callscore-youtube-thumbnail-agent", "callscore-youtube-publishing-agent", "callscore-youtube-commenting-agent", "callscore-youtube-analytics-agent", "callscore-reviewer-head", "callscore-trust-head", "callscore-compliance-linter-head", "callscore-safety-head", "callscore-cmo-head", "callscore-artofwar-strategist", "callscore-markov-trajectory-head", "callscore-ml-verifier-head", "callscore-orchestrator-head"] as const;

type DesignMediaAgentId = (typeof DESIGN_MEDIA_AGENT_IDS)[number];

export interface AgentDesignSkillMatrixRow {
  readonly agent_id: DesignMediaAgentId;
  readonly canonical_51: true;
  readonly uses_frontend_design_skill: true;
  readonly design_bundle_path: typeof CANONICAL_DESIGN_BUNDLE_PATH;
  readonly design_md_path: typeof CANONICAL_DESIGN_MD_PATH;
  readonly allowed_design_actions: string[];
  readonly forbidden_design_actions: string[];
  readonly may_render_final_media: boolean;
  readonly may_write_visual_brief: boolean;
  readonly may_write_video_brief: boolean;
  readonly may_write_thumbnail_brief: boolean;
  readonly may_review_design_alignment: boolean;
  readonly required_receipts: string[];
  readonly status: "complete" | "missing_design_bundle" | "missing_skill" | "overprivileged" | "underprivileged";
}

const RENDER_FINAL = new Set<string>(["callscore-community-drops-head", "callscore-email-partnership-drafts-head", "callscore-linkedin-image-agent", "callscore-reddit-image-agent", "callscore-whop-commerce-head", "callscore-x-image-agent", "callscore-youtube-publishing-agent", "callscore-youtube-thumbnail-agent"]);
const VISUAL_BRIEF = new Set<string>(["callscore-artofwar-strategist", "callscore-cmo-head", "callscore-community-drops-head", "callscore-email-partnership-drafts-head", "callscore-linkedin-head", "callscore-linkedin-posting-agent", "callscore-reddit-head", "callscore-reddit-posting-agent", "callscore-whop-commerce-head", "callscore-x-head", "callscore-x-posting-agent", "callscore-youtube-head", "callscore-youtube-packaging-agent", "callscore-youtube-script-agent"]);
const VIDEO_BRIEF = new Set<string>(["callscore-cmo-head", "callscore-youtube-head", "callscore-youtube-packaging-agent", "callscore-youtube-publishing-agent", "callscore-youtube-script-agent"]);
const THUMB_BRIEF = new Set<string>(["callscore-youtube-head", "callscore-youtube-packaging-agent", "callscore-youtube-thumbnail-agent"]);
const REVIEW_ALIGNMENT = new Set<string>(["callscore-cmo-head", "callscore-compliance-linter-head", "callscore-linkedin-head", "callscore-ml-verifier-head", "callscore-orchestrator-head", "callscore-reddit-head", "callscore-reviewer-head", "callscore-safety-head", "callscore-trust-head", "callscore-x-head", "callscore-youtube-head"]);

export function buildAgentDesignSkillMatrix(): AgentDesignSkillMatrixRow[] {
  return DESIGN_MEDIA_AGENT_IDS.map((agent_id) => ({
    agent_id,
    canonical_51: true,
    uses_frontend_design_skill: true,
    design_bundle_path: CANONICAL_DESIGN_BUNDLE_PATH,
    design_md_path: CANONICAL_DESIGN_MD_PATH,
    allowed_design_actions: [
      ...(RENDER_FINAL.has(agent_id) ? ["read-design-bundle-and-render-authorized-local-media"] : []),
      ...(VISUAL_BRIEF.has(agent_id) ? ["write-canonical-visual-brief"] : []),
      ...(VIDEO_BRIEF.has(agent_id) ? ["write-canonical-video-brief"] : []),
      ...(THUMB_BRIEF.has(agent_id) ? ["write-canonical-thumbnail-brief"] : []),
      ...(REVIEW_ALIGNMENT.has(agent_id) ? ["review-design-alignment"] : []),
      "read-DESIGN.md-as-reference-not-output",
    ],
    forbidden_design_actions: [
      "copy-example-images-as-final-output",
      "use-old-noncanonical-style",
      "hardcode-production-copy-from-examples",
      "provider-public-mutation-in-draft-ready",
      ...(agent_id.endsWith("-posting-agent") ? ["render-final-media"] : []),
    ],
    may_render_final_media: RENDER_FINAL.has(agent_id),
    may_write_visual_brief: VISUAL_BRIEF.has(agent_id),
    may_write_video_brief: VIDEO_BRIEF.has(agent_id),
    may_write_thumbnail_brief: THUMB_BRIEF.has(agent_id),
    may_review_design_alignment: REVIEW_ALIGNMENT.has(agent_id),
    required_receipts: [...REQUIRED_DESIGN_RECEIPTS],
    status: "complete",
  }));
}

export interface DesignBundleReferenceReceipt {
  readonly schema: "callscore.design_bundle_reference_receipt.v1";
  readonly workflow_id: string;
  readonly agent_id: string;
  readonly channel: string;
  readonly artifact_id: string;
  readonly media_task_id: string;
  readonly design_bundle_path: string;
  readonly design_bundle_sha256?: string;
  readonly design_md_path: string;
  readonly design_md_sha256: string;
  readonly canonical_logo_path: string;
  readonly canonical_logo_sha256: string;
  readonly example_images_used_as_reference: string[];
  readonly frontend_design_skill_path: string;
  readonly frontend_design_skill_sha256?: string;
  readonly loaded_before_generation: boolean;
  readonly content_reference_mode: "paths_ids_hashes_only" | string;
  readonly created_at_utc: string;
}

export interface BrandingReceiptV2 {
  readonly schema: "callscore.branding_receipt.v2";
  readonly channel: string;
  readonly artifact_id: string;
  readonly media_artifact_id: string;
  readonly branding_applied: boolean;
  readonly brand_asset_source: "canonical_design_pack" | string;
  readonly brand_asset_path: string;
  readonly brand_asset_sha256: string;
  readonly placement: "top_right" | string;
  readonly top_right_brand_crop_path?: string | null;
  readonly top_right_brand_crop_sha256?: string | null;
  readonly top_right_brand_crop_visible?: boolean;
  readonly final_media_path: string;
  readonly final_media_sha256: string;
  readonly created_by_agent_id: string;
  readonly channel_head_agent_id: string;
  readonly parent_harness_rendered: boolean;
  readonly hardcoded_brand_text_used: boolean;
  readonly fallback_wordmark_used: boolean;
  readonly fallback_icon_only_logo_used?: boolean;
  readonly brand_lockup_safe_zone_clear?: boolean;
  readonly brand_lockup_occlusion_free?: boolean;
  readonly no_hairline_intersects_brand?: boolean;
  readonly tagline_readable?: boolean;
  readonly logo_not_clipped?: boolean;
  readonly brand_lockup_occlusion_check?: Partial<BrandLockupOcclusionCheck> | null;
  readonly content_reference_mode: "paths_ids_hashes_only" | string;
  readonly created_at_utc: string;
}

export type BrandBBox = readonly number[];

export interface BrandLockupOcclusionCheck {
  readonly schema: "callscore.brand_lockup_occlusion_check.v1";
  readonly status: "passed" | "failed";
  readonly media_path: string;
  readonly media_sha256: string;
  readonly brand_asset_path: string;
  readonly brand_asset_sha256: string;
  readonly brand_bbox: BrandBBox;
  readonly brand_safe_zone_bbox: BrandBBox;
  readonly intersecting_line_segments: readonly unknown[];
  readonly intersecting_borders: readonly unknown[];
  readonly intersecting_visual_elements: readonly unknown[];
  readonly min_clearance_px: number;
  readonly required_min_clearance_px: number;
  readonly preferred_clearance_px: number;
  readonly top_right_crop_path: string;
  readonly debug_overlay_path: string;
  readonly brand_lockup_present: boolean;
  readonly brand_lockup_position: "top_right" | string;
  readonly brand_lockup_safe_zone_clear: boolean;
  readonly brand_lockup_occlusion_free: boolean;
  readonly no_hairline_intersects_brand: boolean;
  readonly tagline_readable: boolean;
  readonly logo_not_clipped: boolean;
  readonly pass: boolean;
}

export interface WebsiteDesignAlignmentReceipt {
  readonly schema: "callscore.website_design_alignment_receipt.v1" | "callscore.website_design_alignment_receipt.v2";
  readonly workflow_id: string;
  readonly agent_id: string;
  readonly channel: string;
  readonly artifact_id: string;
  readonly media_artifact_id: string;
  readonly final_media_path: string;
  readonly final_media_sha256: string;
  readonly design_bundle_reference_receipt_id: string;
  readonly checks: Record<string, boolean>;
  readonly style_failures: string[];
  readonly status: "passed" | "failed";
  readonly created_at_utc: string;
}

export function validateDesignBundleReferenceReceipt(receipt: Partial<DesignBundleReferenceReceipt> | null | undefined): string[] {
  const failures: string[] = [];
  if (!receipt || receipt.schema !== "callscore.design_bundle_reference_receipt.v1") return ["missing_design_bundle_reference_receipt"];
  if (receipt.design_bundle_path !== CANONICAL_DESIGN_BUNDLE_PATH) failures.push("wrong_design_bundle_path");
  if (receipt.design_md_path !== CANONICAL_DESIGN_MD_PATH) failures.push("wrong_design_md_path");
  if (receipt.canonical_logo_path !== CANONICAL_DESIGN_PACK_LOGO_PATH) failures.push("wrong_canonical_logo_path");
  if (!receipt.canonical_logo_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.canonical_logo_sha256)) failures.push("missing_canonical_logo_sha256");
  if (receipt.canonical_logo_path === REJECTED_ICON_ONLY_LOGO_PATH) failures.push("icon_only_logo_rejected");
  if (receipt.design_bundle_sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(receipt.design_bundle_sha256)) failures.push("invalid_design_bundle_sha256");
  if (!receipt.design_md_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.design_md_sha256)) failures.push("missing_design_md_sha256");
  if (receipt.loaded_before_generation !== true) failures.push("design_bundle_not_loaded_before_generation");
  if (receipt.content_reference_mode !== "paths_ids_hashes_only") failures.push("design_content_reference_mode_not_paths_ids_hashes_only");
  if (!receipt.frontend_design_skill_path?.endsWith("SKILL.md")) failures.push("missing_frontend_design_skill_path");
  if (receipt.frontend_design_skill_sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(receipt.frontend_design_skill_sha256)) failures.push("invalid_frontend_design_skill_sha256");
  return failures;
}

export function validateBrandLockupOcclusionCheck(receipt: Partial<BrandLockupOcclusionCheck> | null | undefined): string[] {
  if (!receipt || receipt.schema !== "callscore.brand_lockup_occlusion_check.v1") return ["missing_brand_lockup_occlusion_check"];
  const failures: string[] = [];
  const isValidBBox = (bbox: unknown): bbox is BrandBBox => Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === "number" && Number.isFinite(n));
  if (receipt.status !== "passed") failures.push("brand_lockup_occlusion_check_failed");
  if (receipt.pass !== true) failures.push("brand_lockup_occlusion_check_not_passed");
  if (receipt.brand_asset_path !== CANONICAL_DESIGN_PACK_LOGO_PATH) failures.push("wrong_brand_occlusion_asset_path");
  if (!receipt.brand_asset_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.brand_asset_sha256)) failures.push("missing_brand_occlusion_asset_sha256");
  if (!receipt.media_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.media_sha256)) failures.push("missing_brand_occlusion_media_sha256");
  if (!isValidBBox(receipt.brand_bbox)) failures.push("missing_brand_bbox");
  if (!isValidBBox(receipt.brand_safe_zone_bbox)) failures.push("missing_brand_safe_zone_bbox");
  if ((receipt.intersecting_line_segments ?? []).length > 0) failures.push("brand_lockup_safe_zone_intersected_by_line");
  if ((receipt.intersecting_borders ?? []).length > 0) failures.push("brand_lockup_safe_zone_intersected_by_border");
  if ((receipt.intersecting_visual_elements ?? []).length > 0) failures.push("brand_lockup_safe_zone_intersected_by_visual_element");
  if (typeof receipt.min_clearance_px !== "number" || receipt.min_clearance_px < BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX) failures.push("brand_lockup_clearance_below_required");
  if (receipt.required_min_clearance_px !== BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX) failures.push("wrong_brand_lockup_required_clearance");
  if (receipt.preferred_clearance_px !== BRAND_LOCKUP_PREFERRED_CLEARANCE_PX) failures.push("wrong_brand_lockup_preferred_clearance");
  if (!receipt.top_right_crop_path) failures.push("missing_brand_lockup_top_right_crop_path");
  if (!receipt.debug_overlay_path) failures.push("missing_brand_lockup_debug_overlay_path");
  if (receipt.brand_lockup_present !== true) failures.push("brand_lockup_not_present");
  if (receipt.brand_lockup_position !== "top_right") failures.push("brand_lockup_not_top_right");
  if (receipt.brand_lockup_safe_zone_clear !== true) failures.push("brand_lockup_safe_zone_not_clear");
  if (receipt.brand_lockup_occlusion_free !== true) failures.push("brand_lockup_not_occlusion_free");
  if (receipt.no_hairline_intersects_brand !== true) failures.push("hairline_intersects_brand_lockup");
  if (receipt.tagline_readable !== true) failures.push("tagline_not_readable");
  if (receipt.logo_not_clipped !== true) failures.push("logo_clipped");
  return failures;
}

export function validateBrandingReceipt(receipt: Partial<BrandingReceiptV2> | null | undefined): string[] {
  if (!receipt || receipt.schema !== "callscore.branding_receipt.v2") return ["missing_branding_receipt"];
  const failures: string[] = [];
  if (receipt.branding_applied !== true) failures.push("blocked_brand_lockup_missing");
  if (receipt.brand_asset_source !== "canonical_design_pack") failures.push("brand_asset_source_not_canonical_design_pack");
  if (receipt.brand_asset_path !== CANONICAL_DESIGN_PACK_LOGO_PATH) failures.push("wrong_brand_asset_path");
  if (!receipt.brand_asset_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.brand_asset_sha256)) failures.push("missing_brand_asset_sha256");
  if (receipt.placement !== "top_right") failures.push("brand_lockup_not_top_right");
  if (receipt.top_right_brand_crop_visible !== true) failures.push("top_right_brand_crop_not_visible");
  if (!receipt.top_right_brand_crop_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.top_right_brand_crop_sha256)) failures.push("missing_top_right_brand_crop_sha256");
  if (!receipt.final_media_sha256 || !/^[a-f0-9]{64}$/i.test(receipt.final_media_sha256)) failures.push("missing_branded_final_media_sha256");
  if (receipt.parent_harness_rendered !== false) failures.push("parent_harness_rendered_media_cannot_be_canonical_design");
  if (receipt.hardcoded_brand_text_used !== false) failures.push("hardcoded_brand_text_used");
  if (receipt.fallback_wordmark_used !== false) failures.push("fallback_wordmark_used");
  if (receipt.fallback_icon_only_logo_used === true) failures.push("icon_only_logo_rejected");
  if (receipt.brand_lockup_safe_zone_clear !== true) failures.push("brand_lockup_safe_zone_not_clear");
  if (receipt.brand_lockup_occlusion_free !== true) failures.push("brand_lockup_not_occlusion_free");
  if (receipt.no_hairline_intersects_brand !== true) failures.push("hairline_intersects_brand_lockup");
  if (receipt.tagline_readable !== true) failures.push("tagline_not_readable");
  if (receipt.logo_not_clipped !== true) failures.push("logo_clipped");
  failures.push(...validateBrandLockupOcclusionCheck(receipt.brand_lockup_occlusion_check));
  if (receipt.content_reference_mode !== "paths_ids_hashes_only") failures.push("branding_content_reference_mode_not_paths_ids_hashes_only");
  return failures;
}

export function validateWebsiteDesignAlignmentReceipt(receipt: Partial<WebsiteDesignAlignmentReceipt> | null | undefined): string[] {
  if (!receipt || (receipt.schema !== "callscore.website_design_alignment_receipt.v1" && receipt.schema !== "callscore.website_design_alignment_receipt.v2")) return ["missing_website_design_alignment_receipt"];
  const failures: string[] = [];
  if (receipt.status !== "passed") failures.push("blocked_design_mismatch");
  const requiredChecks = [
    "uses_editorial_terminal_style",
    "uses_ink_surface_ramp",
    "uses_sparse_ochre_accent",
    "uses_serif_editorial_hierarchy",
    "uses_mono_numeric_evidence_layers",
    "uses_rectangular_panels",
    "uses_1px_hairlines",
    "uses_provenance_evidence_hierarchy",
    "avoids_generic_saas_card",
    "avoids_neon_crypto_cliche",
    "avoids_ai_gloss",
    "avoids_old_noncanonical_style",
  ];
  for (const check of requiredChecks) {
    if (receipt.checks?.[check] !== true) failures.push(`website_design_alignment_failed_${check}`);
  }
  if (receipt.schema === "callscore.website_design_alignment_receipt.v2") {
    for (const check of ["brand_lockup_present", "brand_lockup_position_top_right", "brand_lockup_safe_zone_clear", "brand_lockup_occlusion_free", "no_hairline_intersects_brand", "tagline_readable", "logo_not_clipped"]) {
      if (receipt.checks?.[check] !== true) failures.push(`website_design_alignment_failed_${check}`);
    }
  }
  if ((receipt.style_failures ?? []).length > 0) failures.push("website_design_alignment_style_failures_present");
  return failures;
}

export function validateMediaDesignCompliance(artifact: {
  readonly design_bundle_reference_receipt?: Partial<DesignBundleReferenceReceipt> | null;
  readonly website_design_alignment_receipt?: Partial<WebsiteDesignAlignmentReceipt> | null;
  readonly branding_receipt?: Partial<BrandingReceiptV2> | null;
  readonly parent_harness_rendered?: boolean;
  readonly visual_proof_object_present?: boolean;
}): string[] {
  const failures = [
    ...validateDesignBundleReferenceReceipt(artifact.design_bundle_reference_receipt),
    ...validateWebsiteDesignAlignmentReceipt(artifact.website_design_alignment_receipt),
    ...validateBrandingReceipt(artifact.branding_receipt),
  ];
  if (artifact.parent_harness_rendered) failures.push("parent_harness_rendered_media_cannot_be_canonical_design");
  if (artifact.visual_proof_object_present === false) failures.push("old_style_or_proof_object_free_visual_rejected");
  return Array.from(new Set(failures));
}
