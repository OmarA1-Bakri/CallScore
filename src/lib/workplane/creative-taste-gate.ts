export type CreativeTasteGateDecision = {
  readonly ok: boolean;
  readonly blocker_codes: readonly string[];
  readonly warnings: readonly string[];
  readonly score: number;
  readonly max_score: number;
  readonly dimension_scores: Record<string, number>;
};

type CreativeTasteGateInput = Record<string, unknown>;

const MAX_SCORE = 45;
const PUBLIC_READY_SCORE_THRESHOLD = 32;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function lower(value: unknown): string {
  return asString(value).toLowerCase();
}

function add(blockers: string[], code: string): void {
  if (!blockers.includes(code)) blockers.push(code);
}

function copyText(input: CreativeTasteGateInput): string {
  return [input.copy, input.exact_copy, input.body, input.post, input.title, input.description]
    .map(asString)
    .filter(Boolean)
    .join("\n");
}

function isPublicReady(input: CreativeTasteGateInput): boolean {
  const stage = lower(input.artifact_stage || input.stage || input.status);
  return input.public_ready === true || stage === "production_ready" || stage === "publish_candidate" || stage === "public_ready";
}

function evidenceRefs(input: CreativeTasteGateInput): readonly string[] {
  return [
    ...asStringArray(input.evidence_refs),
    ...asStringArray(input.shared_evidence_refs),
    ...asStringArray(input.data_refs),
  ];
}

function hasConcreteEvidence(input: CreativeTasteGateInput): boolean {
  const refs = evidenceRefs(input).map((ref) => ref.toLowerCase());
  if (refs.some((ref) => /^(creator|call|stat|score|discourse|product|leaderboard|screenshot|market|video):/.test(ref))) return true;
  for (const field of ["creator_id", "call_id", "stat_id", "product_screenshot_path", "leaderboard_snapshot_id", "discourse_reference_id"]) {
    if (asString(input[field])) return true;
  }
  return false;
}

function visualAsset(input: CreativeTasteGateInput): Record<string, unknown> {
  return asRecord(input.visual_asset);
}

function hasRenderedProof(asset: Record<string, unknown>): boolean {
  return Boolean(asString(asset.rendered_png_path) || asString(asset.png_path)) && /^[a-f0-9]{64}$/i.test(asString(asset.png_sha256));
}

function visualLooksMock(asset: Record<string, unknown>): boolean {
  const klass = lower(asset.class || asset.asset_class || asset.visual_class);
  const title = lower(asset.title);
  const source = lower(asset.source);
  return asset.is_mock === true
    || /mock|placeholder|generic_evidence_card|local_svg_preview|svg_preview/.test(klass)
    || /mock|placeholder|local svg preview|evidence card/.test(title)
    || /packet_scaffold|local_preview/.test(source);
}

function youtubePackage(input: CreativeTasteGateInput): Record<string, unknown> {
  return asRecord(input.youtube_package || input.youtube_publish);
}

function youtubeThumbnail(packet: Record<string, unknown>): Record<string, unknown> {
  return asRecord(packet.thumbnail || packet.thumbnail_asset || packet.thumbnail_proof);
}

function isYoutube(input: CreativeTasteGateInput): boolean {
  return lower(input.channel) === "youtube" || lower(input.platform) === "youtube" || lower(input.artifact_type).includes("youtube");
}

function countReceiptsVibesPhrases(text: string, memory: readonly string[]): number {
  const haystack = [text, ...memory].join("\n").toLowerCase();
  const matches = haystack.match(/receipts?\s*(?:>|over|not)?\s*vibes?|proof\s+beats\s+vibes/g);
  return matches?.length ?? 0;
}

function dimensionScores(input: CreativeTasteGateInput, blockers: readonly string[]): Record<string, number> {
  const text = copyText(input);
  return {
    specificity: hasConcreteEvidence(input) ? 4 : 0,
    surprise: /\b(just another|without receipts|stop trusting|ranking without)\b/i.test(text) ? 3 : 1,
    evidence_density: Math.min(5, evidenceRefs(input).length + (hasConcreteEvidence(input) ? 2 : 0)),
    channel_native: asString(input.channel || input.platform) ? 3 : 1,
    visual_force: hasRenderedProof(visualAsset(input)) ? 4 : 0,
    brand_voice: blockers.includes("generic_product_manifesto_blocked") ? 1 : 3,
    conversion_job: /\b(check|read|compare|open|see|review)\b/i.test(text) ? 3 : 1,
    originality: blockers.includes("overused_receipts_vibes_scaffold") ? 0 : 3,
    safety: blockers.includes("public_draft_disclaimer_blocked") ? 0 : 4,
  };
}

export function evaluateCreativeTasteGate(input: CreativeTasteGateInput): CreativeTasteGateDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const text = copyText(input);
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const publicReady = isPublicReady(input);

  if (/\bcallscore is an evidence layer\b/.test(normalizedText) || /\bhelps users understand\b/.test(normalizedText)) {
    add(blockers, "generic_product_manifesto_blocked");
  }

  if (publicReady && !hasConcreteEvidence(input)) {
    add(blockers, "concrete_evidence_required");
  }

  if (countReceiptsVibesPhrases(text, asStringArray(input.recent_phrase_memory)) >= 3) {
    add(blockers, "overused_receipts_vibes_scaffold");
  }

  if (publicReady && /\b(?:draft|test only|draft test only|not for publication)\b/i.test(text)) {
    add(blockers, "public_draft_disclaimer_blocked");
  }

  const asset = visualAsset(input);
  if (publicReady && Object.keys(asset).length > 0) {
    if (visualLooksMock(asset)) add(blockers, "mock_or_placeholder_visual_blocked");
    if (!hasRenderedProof(asset)) add(blockers, "visual_render_proof_required");
  }

  if (publicReady && isYoutube(input)) {
    const packet = youtubePackage(input);
    if (!asString(packet.full_script)) add(blockers, "youtube_full_script_required");
    if (!hasRenderedProof(youtubeThumbnail(packet))) add(blockers, "youtube_rendered_thumbnail_required");
  }

  const scores = dimensionScores(input, blockers);
  const score = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (publicReady && blockers.length === 0 && score < PUBLIC_READY_SCORE_THRESHOLD) {
    add(blockers, "creative_score_below_threshold");
  }

  return {
    ok: blockers.length === 0,
    blocker_codes: blockers,
    warnings,
    score,
    max_score: MAX_SCORE,
    dimension_scores: scores,
  };
}
