const THOUGHT_LEADERSHIP_ALLOWED_VISUAL_CLASSES = [
  "product_screenshot",
  "thesis_visual",
  "chart",
  "diagram",
  "founder_product_build_visual",
] as const;

type VisualAsset = {
  readonly title?: unknown;
  readonly class?: unknown;
  readonly asset_class?: unknown;
  readonly visual_class?: unknown;
};

type YoutubePublishPacket = {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly thumbnail_path?: unknown;
  readonly captions_path?: unknown;
  readonly qa_report_path?: unknown;
  readonly approval_receipt_id?: unknown;
};

export type SocialOriginalityGateInput = Record<string, unknown>;

export type SocialOriginalityGateDecision = {
  readonly ok: boolean;
  readonly blocker_codes: readonly string[];
  readonly warnings: readonly string[];
  readonly allowed_visual_classes: readonly string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCopy(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\.\.\.|…/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactCopy(value: unknown): string {
  return normalizeCopy(value).replace(/\s+/g, "");
}

function addBlocker(blockers: string[], code: string): void {
  if (!blockers.includes(code)) blockers.push(code);
}

function visualAsset(input: SocialOriginalityGateInput): VisualAsset | null {
  return asRecord(input.visual_asset) as VisualAsset | null;
}

function visualClass(asset: VisualAsset | null): string {
  if (!asset) return "";
  return asString(asset.class || asset.asset_class || asset.visual_class).trim().toLowerCase();
}

function visualTitle(asset: VisualAsset | null): string {
  return asString(asset?.title).trim().toLowerCase();
}

function evaluateThoughtLeadershipVisual(input: SocialOriginalityGateInput, blockers: string[]): void {
  if (asString(input.campaign_type) !== "thought_leadership") return;

  const asset = visualAsset(input);
  const assetClass = visualClass(asset);
  const title = visualTitle(asset);

  if (assetClass === "generic_evidence_card" || title === "evidence card") {
    addBlocker(blockers, "generic_evidence_card_thought_leadership_blocked");
    return;
  }

  if (asset && assetClass && !THOUGHT_LEADERSHIP_ALLOWED_VISUAL_CLASSES.includes(assetClass as typeof THOUGHT_LEADERSHIP_ALLOWED_VISUAL_CLASSES[number])) {
    addBlocker(blockers, "thought_leadership_visual_class_not_allowed");
  }
}

function evaluateCrossPlatformCopy(input: SocialOriginalityGateInput, blockers: string[]): void {
  const rawX = asString(input.x_copy);
  const rawLinkedin = asString(input.linkedin_copy);
  if (!rawX || !rawLinkedin) return;

  const x = compactCopy(rawX);
  const linkedin = compactCopy(rawLinkedin);
  if (!x || !linkedin) return;

  if (x === linkedin) {
    addBlocker(blockers, "cross_platform_duplicate_copy");
    return;
  }

  if (linkedin.startsWith(x) || linkedin.includes(x)) {
    addBlocker(blockers, "linkedin_padded_x_copy");
  }

  const xLooksTruncated = /(?:\.\.\.|…)\s*$/.test(rawX.trim());
  if ((xLooksTruncated && linkedin.startsWith(x)) || (linkedin.startsWith(x) && x.length < linkedin.length * 0.9)) {
    addBlocker(blockers, "x_truncated_linkedin_copy");
  }
}

function evaluateReddit(input: SocialOriginalityGateInput, blockers: string[]): void {
  if (asString(input.platform).toLowerCase() !== "reddit") return;
  const surface = asString(input.reddit_surface).toLowerCase();
  const isSubredditAction = surface === "subreddit" || isNonEmptyString(input.subreddit);
  if (!isSubredditAction) return;

  if (!input.reddit_community_approval) addBlocker(blockers, "reddit_community_approval_required");
  if (input.subreddit_rules_checked !== true) addBlocker(blockers, "reddit_rules_check_required");
  if (input.community_fit !== true) addBlocker(blockers, "reddit_community_fit_required");
}

function youtubePacket(input: SocialOriginalityGateInput): YoutubePublishPacket | null {
  return asRecord(input.youtube_publish) as YoutubePublishPacket | null;
}

function evaluateYoutube(input: SocialOriginalityGateInput, blockers: string[]): void {
  const packet = youtubePacket(input);
  if (asString(input.platform).toLowerCase() !== "youtube" && !packet) return;

  if (!isNonEmptyString(packet?.title)) addBlocker(blockers, "youtube_title_required");
  if (!isNonEmptyString(packet?.description)) addBlocker(blockers, "youtube_description_required");
  if (!isNonEmptyString(packet?.thumbnail_path)) addBlocker(blockers, "youtube_thumbnail_required");
  if (!isNonEmptyString(packet?.captions_path)) addBlocker(blockers, "youtube_captions_required");
  if (!isNonEmptyString(packet?.qa_report_path)) addBlocker(blockers, "youtube_qa_report_required");
  if (!isNonEmptyString(packet?.approval_receipt_id)) addBlocker(blockers, "youtube_approval_required");
}

export function evaluateSocialOriginalityGate(input: SocialOriginalityGateInput): SocialOriginalityGateDecision {
  const blockerCodes: string[] = [];

  evaluateThoughtLeadershipVisual(input, blockerCodes);
  evaluateCrossPlatformCopy(input, blockerCodes);
  evaluateReddit(input, blockerCodes);
  evaluateYoutube(input, blockerCodes);

  return {
    ok: blockerCodes.length === 0,
    blocker_codes: blockerCodes,
    warnings: [],
    allowed_visual_classes: [...THOUGHT_LEADERSHIP_ALLOWED_VISUAL_CLASSES],
  };
}
