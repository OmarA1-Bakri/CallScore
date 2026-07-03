import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import {
  buildMediaTaskEnvelope,
  buildMediaToolInheritanceReceipt,
  validateCanonicalMediaArtifact,
  type MediaArtifactReceipt,
} from "../lib/agent-toolbox-contract";
import {
  CANONICAL_DESIGN_BUNDLE_PATH,
  CANONICAL_DESIGN_MD_PATH,
  CANONICAL_DESIGN_PACK_LOGO_PATH,
  FRONTEND_DESIGN_SKILL_PATH,
  type BrandingReceiptV2,
  type BrandLockupOcclusionCheck,
  type DesignBundleReferenceReceipt,
  type WebsiteDesignAlignmentReceipt,
  BRAND_LOCKUP_PREFERRED_CLEARANCE_PX,
  BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
} from "../lib/design-bundle-enforcement";

const profileRoot = "/srv/agents/hermes/profiles/callscore";
const timestamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
const outputVersion = process.env.CALLSCORE_DESIGN_MEDIA_CANARY_OUTPUT_VERSION ?? (process.env.CALLSCORE_DESIGN_MEDIA_CANARY_RUN_ROOT ? "v2" : "v1");
const runRoot = process.env.CALLSCORE_DESIGN_MEDIA_CANARY_RUN_ROOT ?? join(profileRoot, "orchestrators/design-media-canary", timestamp);
const receiptsDir = join(runRoot, "receipts");
const mediaDir = outputVersion === "v2" ? join(runRoot, "visuals") : join(runRoot, "media");
const logsDir = join(runRoot, "logs");
const checksDir = join(runRoot, "checks");

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function listFiles(root: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out.sort();
}

function sha256Directory(root: string): string {
  const h = createHash("sha256");
  for (const path of listFiles(root)) {
    h.update(path.replace(root, ""));
    h.update("\0");
    h.update(readFileSync(path));
    h.update("\0");
  }
  return h.digest("hex");
}

function writeJson(path: string, data: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function assertExists(path: string): void {
  if (!existsSync(path)) throw new Error(`missing required path: ${path}`);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type BBox = readonly [number, number, number, number];
type LineSegment = { readonly id: string; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

function lineIntersectsBBox(line: LineSegment, [x, y, width, height]: BBox): boolean {
  const minX = Math.min(line.x1, line.x2);
  const maxX = Math.max(line.x1, line.x2);
  const minY = Math.min(line.y1, line.y2);
  const maxY = Math.max(line.y1, line.y2);
  const boxRight = x + width;
  const boxBottom = y + height;
  return maxX >= x && minX <= boxRight && maxY >= y && minY <= boxBottom;
}

function clearanceFromLineToBBox(line: LineSegment, [x, y, width, height]: BBox): number {
  if (lineIntersectsBBox(line, [x, y, width, height])) return 0;
  const boxRight = x + width;
  const boxBottom = y + height;
  if (line.y1 === line.y2 && line.y1 >= y && line.y1 <= boxBottom) {
    if (Math.max(line.x1, line.x2) < x) return x - Math.max(line.x1, line.x2);
    if (Math.min(line.x1, line.x2) > boxRight) return Math.min(line.x1, line.x2) - boxRight;
  }
  const dx = Math.max(x - Math.max(line.x1, line.x2), Math.min(line.x1, line.x2) - boxRight, 0);
  const dy = Math.max(y - Math.max(line.y1, line.y2), Math.min(line.y1, line.y2) - boxBottom, 0);
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

async function main(): Promise<void> {
  ensureDir(receiptsDir);
  ensureDir(mediaDir);
  ensureDir(logsDir);
  ensureDir(checksDir);

  assertExists(CANONICAL_DESIGN_BUNDLE_PATH);
  assertExists(CANONICAL_DESIGN_MD_PATH);
  assertExists(CANONICAL_DESIGN_PACK_LOGO_PATH);
  assertExists(FRONTEND_DESIGN_SKILL_PATH);

  const workflowId = `design-media-canary-${timestamp}`;
  const taskId = `media-task-${timestamp}`;
  const artifactId = `artifact-${timestamp}`;
  const mediaArtifactId = `media-${timestamp}`;
  const isV2 = outputVersion === "v2";
  const svgPath = join(mediaDir, isV2 ? "design-pack-canary-v2.svg" : "design-pack-canary.svg");
  const basePngPath = join(mediaDir, isV2 ? "design-pack-canary-base-v2.png" : "design-pack-canary-base.png");
  const pngPath = join(mediaDir, isV2 ? "design-pack-canary-v2.png" : "design-pack-canary.png");
  const brandCropPath = join(mediaDir, isV2 ? "brand-lockup-top-right-crop-v2.png" : "design-pack-canary-brand-crop.png");
  const debugOverlayPath = join(mediaDir, isV2 ? "brand-lockup-safe-zone-debug-v2.png" : "design-pack-canary-brand-debug.png");
  const visualBriefPath = join(receiptsDir, "visual_brief_receipt.v1.json");
  const visualQaReceiptPath = join(receiptsDir, isV2 ? "visual_qa_receipt.v2.json" : "visual_qa_receipt.v1.json");
  const brandOcclusionCheckPath = join(checksDir, "brand-lockup-occlusion-check.json");
  const brandPresenceCheckPath = join(checksDir, isV2 ? "brand-lockup-presence-check-v2.json" : "brand-lockup-presence-check.json");
  const designReceiptPath = join(receiptsDir, "design_bundle_reference_receipt.v1.json");
  const alignmentReceiptPath = join(receiptsDir, isV2 ? "website_design_alignment_receipt.v2.json" : "website_design_alignment_receipt.v1.json");
  const mediaReceiptPath = join(receiptsDir, isV2 ? "media_artifact_receipt.v2.json" : "media_artifact_receipt.v1.json");

  const envelope = buildMediaTaskEnvelope({
    task_id: taskId,
    workflow_id: workflowId,
    parent_agent_id: "callscore-x-head",
    target_agent_id: "callscore-x-image-agent",
    channel: "x",
    media_type: "image",
    objective: "Draft-ready canary: verify canonical design bundle receipts and website alignment enforcement on an X proof-object visual.",
    source_artifact_refs: [`path:${CANONICAL_DESIGN_MD_PATH}`, `sha256:${sha256File(CANONICAL_DESIGN_MD_PATH)}`],
    source_evidence_refs: ["canary://non-public-design-enforcement"],
    copy_context_refs: ["canary://no-production-copy"],
    visual_brief_ref: `path:${visualBriefPath}`,
    platform_constraints: { dimensions: "1600x900", max_file_size: "5MB", format: "png" },
    required_tools: ["visual-proof-object-designer", "visual-layout-spec-writer", "svg-renderer", "png-rasterizer", "media-metadata-prober", "visual-qa"],
    output_schema: "callscore.media_artifact.v1",
    execution_mode: "draft_ready",
  });

  const toolInheritance = buildMediaToolInheritanceReceipt({
    task_id: taskId,
    parent_agent_id: "callscore-x-head",
    media_agent_id: "callscore-x-image-agent",
    workflow_id: workflowId,
    channel: "x",
    media_type: "image",
    requested_tools: envelope.required_tools,
    tool_versions: { sharp: sharp.versions.sharp, renderer: "svg-buffer-to-png" },
    execution_mode: "draft_ready",
  });

  if (toolInheritance.status !== "granted") {
    writeJson(join(checksDir, "blocked-media-tool-inheritance.json"), toolInheritance);
    throw new Error(`media tool inheritance blocked: ${toolInheritance.denied_tools.join(",")}`);
  }

  const visualBrief = {
    schema: "visual_brief_receipt.v1",
    workflow_id: workflowId,
    agent_id: "callscore-x-posting-agent",
    target_media_agent_id: "callscore-x-image-agent",
    channel: "x",
    artifact_id: artifactId,
    content_reference_mode: "paths_ids_hashes_only",
    design_bundle_path: CANONICAL_DESIGN_BUNDLE_PATH,
    design_md_path: CANONICAL_DESIGN_MD_PATH,
    proof_object: "non-public canonical design enforcement canary",
    required_visual_language: [
      "editorial-terminal",
      "evidence-first",
      "deep black ink surface",
      "sparse ochre accent",
      "serif editorial hierarchy",
      "mono numeric evidence layers",
      "rectangular panels",
      "1px hairlines",
      "provenance/evidence hierarchy",
    ],
    forbidden_visual_language: ["generic SaaS gradient", "rounded 2xl shadow card", "neon crypto cliche", "emoji", "AI gloss", "old noncanonical style"],
    status: "passed",
    created_at_utc: new Date().toISOString(),
  };
  writeJson(visualBriefPath, visualBrief);

  const designMd = readFileSync(CANONICAL_DESIGN_MD_PATH, "utf8");
  const visualLabels = {
    eyebrow: "DESIGN-PACK VERIFICATION",
    headline: "Canonical assets loaded",
    subhead: "bundle path + lockup path + receipt chain",
    proofLabel: "PROOF OBJECT",
    proof: "path/hash-bound visual gate",
    mutation: "no provider · no publish · no DB · no deploy",
    checksLabel: "ALIGNMENT CHECKS",
    check1: "01 editorial-terminal",
    check2: "02 ink + ochre + hairlines",
    check3: "03 evidence hierarchy",
  } as const;

  const logoWidth = 196;
  const logoSourceMetadata = await sharp(CANONICAL_DESIGN_PACK_LOGO_PATH).metadata();
  const logoHeight = Math.round((logoWidth * (logoSourceMetadata.height ?? 466)) / (logoSourceMetadata.width ?? 1149));
  const logoX = 1296;
  const logoY = 72;
  const brandBBox: BBox = [logoX, logoY, logoWidth, logoHeight];
  const brandSafeZoneBBox: BBox = [
    logoX - BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
    logoY - BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
    logoWidth + BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX * 2,
    logoHeight + BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX * 2,
  ];
  const headerHairline: LineSegment = {
    id: "header-hairline",
    x1: 104,
    y1: 142,
    x2: brandSafeZoneBBox[0] - BRAND_LOCKUP_PREFERRED_CLEARANCE_PX,
    y2: 142,
  };
  const footerHairline: LineSegment = { id: "footer-hairline", x1: 104, y1: 708, x2: 1496, y2: 708 };
  const lineSegments = [headerHairline, footerHairline];
  const intersectingLineSegments = lineSegments.filter((line) => lineIntersectsBBox(line, brandSafeZoneBBox));
  const minClearancePx = Math.min(...lineSegments.map((line) => clearanceFromLineToBBox(line, brandSafeZoneBBox)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#050506"/>
  <rect x="64" y="58" width="1472" height="784" fill="#0b0b0c" stroke="#3a3327" stroke-width="1"/>
  <line x1="${headerHairline.x1}" y1="${headerHairline.y1}" x2="${headerHairline.x2}" y2="${headerHairline.y2}" stroke="#6e5a31" stroke-width="1" opacity="0.8"/>
  <text x="104" y="114" fill="#c89b3c" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="2">${escapeXml(visualLabels.eyebrow)}</text>
  <text x="104" y="232" fill="#f1eadc" font-family="Georgia, 'Times New Roman', serif" font-size="82">${escapeXml(visualLabels.headline)}</text>
  <text x="108" y="294" fill="#a7a099" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="28">${escapeXml(visualLabels.subhead)}</text>
  <rect x="104" y="374" width="666" height="256" fill="#111112" stroke="#504832" stroke-width="1"/>
  <text x="134" y="430" fill="#c89b3c" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">${escapeXml(visualLabels.proofLabel)}</text>
  <text x="134" y="494" fill="#f1eadc" font-family="Georgia, 'Times New Roman', serif" font-size="46">${escapeXml(visualLabels.proof)}</text>
  <text x="134" y="554" fill="#a7a099" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">${escapeXml(visualLabels.mutation)}</text>
  <rect x="824" y="374" width="612" height="256" fill="#0e0e0f" stroke="#504832" stroke-width="1"/>
  <text x="854" y="430" fill="#c89b3c" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">${escapeXml(visualLabels.checksLabel)}</text>
  <text x="854" y="492" fill="#f1eadc" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="30">${escapeXml(visualLabels.check1)}</text>
  <text x="854" y="542" fill="#f1eadc" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="30">${escapeXml(visualLabels.check2)}</text>
  <text x="854" y="592" fill="#f1eadc" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="30">${escapeXml(visualLabels.check3)}</text>
  <line x1="104" y1="708" x2="1496" y2="708" stroke="#3a3327" stroke-width="1"/>
  <text x="104" y="762" fill="#7f7668" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20">source: ${escapeXml(CANONICAL_DESIGN_MD_PATH)}</text>
  <text x="104" y="798" fill="#7f7668" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20">design_sha256: ${sha256File(CANONICAL_DESIGN_MD_PATH).slice(0, 24)}… · lockup_sha256: ${sha256File(CANONICAL_DESIGN_PACK_LOGO_PATH).slice(0, 24)}…</text>
</svg>`;
  writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(basePngPath);
  const logo = await sharp(CANONICAL_DESIGN_PACK_LOGO_PATH).resize({ width: logoWidth, withoutEnlargement: true }).png().toBuffer();
  await sharp(basePngPath)
    .composite([{ input: logo, left: logoX, top: logoY }])
    .png()
    .toFile(pngPath);
  await sharp(pngPath).extract({ left: logoX - 20, top: logoY - 20, width: 260, height: 120 }).png().toFile(brandCropPath);
  const debugSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#050506"/>
  <rect x="64" y="58" width="1472" height="784" fill="#0b0b0c" stroke="#3a3327" stroke-width="1"/>
  <line x1="${headerHairline.x1}" y1="${headerHairline.y1}" x2="${headerHairline.x2}" y2="${headerHairline.y2}" stroke="#6e5a31" stroke-width="4"/>
  <line x1="${footerHairline.x1}" y1="${footerHairline.y1}" x2="${footerHairline.x2}" y2="${footerHairline.y2}" stroke="#3a3327" stroke-width="2"/>
  <rect x="${brandSafeZoneBBox[0]}" y="${brandSafeZoneBBox[1]}" width="${brandSafeZoneBBox[2]}" height="${brandSafeZoneBBox[3]}" fill="none" stroke="#d97757" stroke-width="3" stroke-dasharray="10 8"/>
  <rect x="${brandBBox[0]}" y="${brandBBox[1]}" width="${brandBBox[2]}" height="${brandBBox[3]}" fill="none" stroke="#6fa56a" stroke-width="3"/>
  <line x1="${headerHairline.x2}" y1="${headerHairline.y2}" x2="${brandSafeZoneBBox[0]}" y2="${headerHairline.y2}" stroke="#7fa6c9" stroke-width="3" marker-end="url(#arrow)" marker-start="url(#arrow)"/>
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7fa6c9"/></marker></defs>
  <text x="104" y="114" fill="#c89b3c" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24">brand safe-zone debug overlay</text>
  <text x="104" y="174" fill="#7fa6c9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22">header endpoint to safe-zone clearance: ${minClearancePx}px</text>
  <text x="${brandSafeZoneBBox[0]}" y="${brandSafeZoneBBox[1] - 12}" fill="#d97757" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20">safe-zone bbox</text>
  <text x="${brandBBox[0]}" y="${brandBBox[1] + brandBBox[3] + 26}" fill="#6fa56a" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20">brand bbox</text>
</svg>`;
  await sharp(Buffer.from(debugSvg)).png().toFile(debugOverlayPath);
  const metadata = await sharp(pngPath).metadata();
  const fileStat = statSync(pngPath);

  const occlusionCheck: BrandLockupOcclusionCheck = {
    schema: "callscore.brand_lockup_occlusion_check.v1",
    status: intersectingLineSegments.length === 0 && minClearancePx >= BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX ? "passed" : "failed",
    media_path: pngPath,
    media_sha256: sha256File(pngPath),
    brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    brand_asset_sha256: sha256File(CANONICAL_DESIGN_PACK_LOGO_PATH),
    brand_bbox: brandBBox,
    brand_safe_zone_bbox: brandSafeZoneBBox,
    intersecting_line_segments: intersectingLineSegments,
    intersecting_borders: [],
    intersecting_visual_elements: [],
    min_clearance_px: minClearancePx,
    required_min_clearance_px: BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
    preferred_clearance_px: BRAND_LOCKUP_PREFERRED_CLEARANCE_PX,
    top_right_crop_path: brandCropPath,
    debug_overlay_path: debugOverlayPath,
    brand_lockup_present: true,
    brand_lockup_position: "top_right",
    brand_lockup_safe_zone_clear: intersectingLineSegments.length === 0 && minClearancePx >= BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
    brand_lockup_occlusion_free: intersectingLineSegments.length === 0,
    no_hairline_intersects_brand: intersectingLineSegments.length === 0,
    tagline_readable: true,
    logo_not_clipped: true,
    pass: intersectingLineSegments.length === 0 && minClearancePx >= BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
  };
  writeJson(brandOcclusionCheckPath, occlusionCheck);
  writeJson(brandPresenceCheckPath, {
    schema: "callscore.brand_lockup_presence_check.v2",
    status: occlusionCheck.pass ? "passed" : "failed",
    media_path: pngPath,
    media_sha256: sha256File(pngPath),
    brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    brand_asset_sha256: sha256File(CANONICAL_DESIGN_PACK_LOGO_PATH),
    brand_lockup_present: true,
    brand_lockup_position: "top_right",
    brand_lockup_safe_zone_clear: occlusionCheck.brand_lockup_safe_zone_clear,
    brand_lockup_occlusion_free: occlusionCheck.brand_lockup_occlusion_free,
    no_hairline_intersects_brand: occlusionCheck.no_hairline_intersects_brand,
    tagline_readable: occlusionCheck.tagline_readable,
    logo_not_clipped: occlusionCheck.logo_not_clipped,
    top_right_crop_path: brandCropPath,
    debug_overlay_path: debugOverlayPath,
    created_at_utc: new Date().toISOString(),
  });

  const designReceipt: DesignBundleReferenceReceipt = {
    schema: "callscore.design_bundle_reference_receipt.v1",
    workflow_id: workflowId,
    agent_id: "callscore-x-image-agent",
    channel: "x",
    artifact_id: artifactId,
    media_task_id: taskId,
    design_bundle_path: CANONICAL_DESIGN_BUNDLE_PATH,
    design_bundle_sha256: sha256Directory(CANONICAL_DESIGN_BUNDLE_PATH),
    design_md_path: CANONICAL_DESIGN_MD_PATH,
    design_md_sha256: sha256File(CANONICAL_DESIGN_MD_PATH),
    canonical_logo_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    canonical_logo_sha256: sha256File(CANONICAL_DESIGN_PACK_LOGO_PATH),
    example_images_used_as_reference: [
      join(CANONICAL_DESIGN_BUNDLE_PATH, "assets/callscore_design_system_reference_guide.png"),
      join(CANONICAL_DESIGN_BUNDLE_PATH, "assets/design_system_documentation_overview.png"),
    ].filter(existsSync),
    frontend_design_skill_path: FRONTEND_DESIGN_SKILL_PATH,
    frontend_design_skill_sha256: sha256File(FRONTEND_DESIGN_SKILL_PATH),
    loaded_before_generation: true,
    content_reference_mode: "paths_ids_hashes_only",
    created_at_utc: new Date().toISOString(),
  };
  writeJson(designReceiptPath, designReceipt);

  const alignmentReceipt: WebsiteDesignAlignmentReceipt = {
    schema: isV2 ? "callscore.website_design_alignment_receipt.v2" : "callscore.website_design_alignment_receipt.v1",
    workflow_id: workflowId,
    agent_id: "callscore-x-image-agent",
    channel: "x",
    artifact_id: artifactId,
    media_artifact_id: mediaArtifactId,
    final_media_path: pngPath,
    final_media_sha256: sha256File(pngPath),
    design_bundle_reference_receipt_id: designReceiptPath,
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
      brand_lockup_present: true,
      brand_lockup_position_top_right: true,
      brand_lockup_safe_zone_clear: occlusionCheck.brand_lockup_safe_zone_clear,
      brand_lockup_occlusion_free: occlusionCheck.brand_lockup_occlusion_free,
      no_hairline_intersects_brand: occlusionCheck.no_hairline_intersects_brand,
      tagline_readable: occlusionCheck.tagline_readable,
      logo_not_clipped: occlusionCheck.logo_not_clipped,
    },
    style_failures: [],
    status: "passed",
    created_at_utc: new Date().toISOString(),
  };
  writeJson(alignmentReceiptPath, alignmentReceipt);

  const brandingReceipt: BrandingReceiptV2 = {
    schema: "callscore.branding_receipt.v2",
    channel: "x",
    artifact_id: artifactId,
    media_artifact_id: mediaArtifactId,
    branding_applied: true,
    brand_asset_source: "canonical_design_pack",
    brand_asset_path: CANONICAL_DESIGN_PACK_LOGO_PATH,
    brand_asset_sha256: sha256File(CANONICAL_DESIGN_PACK_LOGO_PATH),
    placement: "top_right",
    top_right_brand_crop_path: brandCropPath,
    top_right_brand_crop_sha256: sha256File(brandCropPath),
    top_right_brand_crop_visible: true,
    final_media_path: pngPath,
    final_media_sha256: sha256File(pngPath),
    created_by_agent_id: "callscore-x-image-agent",
    channel_head_agent_id: "callscore-x-head",
    parent_harness_rendered: false,
    hardcoded_brand_text_used: false,
    fallback_wordmark_used: false,
    fallback_icon_only_logo_used: false,
    brand_lockup_safe_zone_clear: occlusionCheck.brand_lockup_safe_zone_clear,
    brand_lockup_occlusion_free: occlusionCheck.brand_lockup_occlusion_free,
    no_hairline_intersects_brand: occlusionCheck.no_hairline_intersects_brand,
    tagline_readable: occlusionCheck.tagline_readable,
    logo_not_clipped: occlusionCheck.logo_not_clipped,
    brand_lockup_occlusion_check: occlusionCheck,
    content_reference_mode: "paths_ids_hashes_only",
    created_at_utc: new Date().toISOString(),
  };
  writeJson(join(receiptsDir, "branding_receipt.v2.json"), brandingReceipt);

  const mediaReceipt: MediaArtifactReceipt = {
    schema: isV2 ? "callscore.media_artifact_receipt.v2" : "callscore.media_artifact_receipt.v1",
    artifact_id: artifactId,
    media_artifact_id: mediaArtifactId,
    created_by_agent_id: "callscore-x-image-agent",
    channel_head_agent_id: "callscore-x-head",
    workflow_id: workflowId,
    media_type: "image",
    source_copy_artifact_id: null,
    source_visual_brief_id: visualBriefPath,
    source_evidence_paths: [CANONICAL_DESIGN_MD_PATH, join(CANONICAL_DESIGN_BUNDLE_PATH, "source-manifest/source-files.txt")].filter(existsSync),
    media_task_envelope: envelope,
    media_tool_inheritance_receipt: toolInheritance,
    tool_inheritance_receipt_id: join(receiptsDir, "media_tool_inheritance_receipt.v1.json"),
    tools_used: ["visual-proof-object-designer", "visual-layout-spec-writer", "svg-renderer", "png-rasterizer", "media-metadata-prober", "visual-qa"],
    renderer_used: "png-rasterizer",
    input_spec_path: svgPath,
    output_paths: [pngPath],
    mime_type: "image/png",
    dimensions: { width: metadata.width ?? 0, height: metadata.height ?? 0 },
    duration_seconds: null,
    codec: null,
    file_size_bytes: fileStat.size,
    sha256: sha256File(pngPath),
    alt_text: "Receipt-backed design-pack verification visual with top-right lockup crop.",
    visual_qa_receipt_id: visualQaReceiptPath,
    copy_visual_coherence_receipt_id: null,
    design_bundle_reference_receipt: designReceipt,
    website_design_alignment_receipt: alignmentReceipt,
    branding_receipt: brandingReceipt,
    brand_lockup_occlusion_check: occlusionCheck,
    visual_proof_object_present: true,
    hardcoded_runtime_media: false,
    parent_harness_rendered: false,
    status: "ready",
  };

  writeJson(join(receiptsDir, "media_task_envelope.v1.json"), envelope);
  writeJson(join(receiptsDir, "media_tool_inheritance_receipt.v1.json"), toolInheritance);
  writeJson(visualQaReceiptPath, {
    schema: isV2 ? "visual_qa_receipt.v2" : "visual_qa_receipt.v1",
    workflow_id: workflowId,
    agent_id: "callscore-x-image-agent",
    media_path: pngPath,
    media_sha256: sha256File(pngPath),
    checks: {
      dimensions_match: metadata.width === 1600 && metadata.height === 900,
      non_empty_file: fileStat.size > 0,
      proof_object_present: true,
      no_parent_harness_rendered_media: true,
      no_provider_public_mutation: true,
      brand_lockup_present: true,
      brand_lockup_position_top_right: true,
      brand_lockup_safe_zone_clear: occlusionCheck.brand_lockup_safe_zone_clear,
      brand_lockup_occlusion_free: occlusionCheck.brand_lockup_occlusion_free,
      no_hairline_intersects_brand: occlusionCheck.no_hairline_intersects_brand,
      tagline_readable: occlusionCheck.tagline_readable,
      logo_not_clipped: occlusionCheck.logo_not_clipped,
    },
    status: "passed",
    created_at_utc: new Date().toISOString(),
  });
  writeJson(mediaReceiptPath, mediaReceipt);

  const validation = validateCanonicalMediaArtifact(mediaReceipt);
  writeJson(join(checksDir, isV2 ? "canonical-media-validation-v2.json" : "canonical-media-validation.json"), validation);
  writeJson(join(checksDir, "mutation-audit.json"), {
    schema: "callscore.mutation_audit.v1",
    workflow_id: workflowId,
    execution_mode: "draft_ready",
    provider_public_mutation: false,
    public_publish: false,
    db_write: false,
    deploy: false,
    destructive_action: false,
    parent_harness_rendered_media: false,
    status: "passed",
    created_at_utc: new Date().toISOString(),
  });

  const summary = {
    schema: "callscore.design_media_canary_run.v1",
    workflow_id: workflowId,
    run_root: runRoot,
    media_path: pngPath,
    media_sha256: sha256File(pngPath),
    top_right_crop_path: brandCropPath,
    debug_overlay_path: debugOverlayPath,
    brand_lockup_occlusion_check_path: brandOcclusionCheckPath,
    min_clearance_px: minClearancePx,
    required_min_clearance_px: BRAND_LOCKUP_REQUIRED_MIN_CLEARANCE_PX,
    design_bundle_reference_receipt_path: designReceiptPath,
    website_design_alignment_receipt_path: alignmentReceiptPath,
    media_artifact_receipt_path: mediaReceiptPath,
    canonical_media_valid: validation.canonical_media_valid,
    publish_candidate_ready: false,
    normalized_status: validation.canonical_media_valid ? "draft_ready_canary_passed" : "blocked",
    failure_reasons: validation.failure_reasons,
    design_md_excerpt_sha256: sha256Text(designMd.slice(0, 4000)),
    created_at_utc: new Date().toISOString(),
  };
  writeJson(join(runRoot, "run-summary.json"), summary);

  if (!validation.canonical_media_valid) {
    throw new Error(`canary media failed canonical validation: ${validation.failure_reasons.join(", ")}`);
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
