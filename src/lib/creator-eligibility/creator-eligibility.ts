import {
  CREATOR_CALL_FOCUS_PATTERNS,
  HYBRID_OR_CONTEXT_FOCUS_PATTERNS,
  NEWS_MEDIA_FOCUS_PATTERNS,
  REVIEWED_CREATOR_EXCLUSIONS,
} from "./news-channel-exclusions";

export interface CreatorEligibilityInput {
  readonly id?: number | string | null;
  readonly name?: string | null;
  readonly youtube_handle?: string | null;
  readonly focus?: string | null;
  readonly entity_type?: string | null;
  readonly is_news_channel?: boolean | null;
  readonly eligible_for_creator_scoring?: boolean | null;
}

function text(input: CreatorEligibilityInput): string {
  return [input.name, input.youtube_handle, input.focus, input.entity_type]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function isReviewedCreatorExclusion(input: CreatorEligibilityInput): boolean {
  const id = input.id == null ? null : Number(input.id);
  const handle = input.youtube_handle?.trim().toLowerCase() ?? null;
  const name = input.name?.trim().toLowerCase() ?? null;
  return REVIEWED_CREATOR_EXCLUSIONS.some((item) => (
    (item.creator_id != null && item.creator_id === id) ||
    (item.youtube_handle != null && item.youtube_handle.toLowerCase() === handle) ||
    (item.name != null && item.name.toLowerCase() === name)
  ));
}

export function isNewsOrMediaCreator(input: CreatorEligibilityInput): boolean {
  if (input.is_news_channel === true) return true;
  if (String(input.entity_type ?? "").toLowerCase() === "news_media") return true;
  if (isReviewedCreatorExclusion(input)) return true;
  return matchesAny(text(input), NEWS_MEDIA_FOCUS_PATTERNS);
}

export function isHybridOrContextOnlyCreator(input: CreatorEligibilityInput): boolean {
  const value = text(input);
  if (matchesAny(value, CREATOR_CALL_FOCUS_PATTERNS)) return false;
  return matchesAny(value, HYBRID_OR_CONTEXT_FOCUS_PATTERNS);
}

export function isEligibleCreatorForIntelligence(input: CreatorEligibilityInput): boolean {
  if (input.eligible_for_creator_scoring === false) return false;
  if (isNewsOrMediaCreator(input)) return false;
  if (isHybridOrContextOnlyCreator(input)) return false;
  return true;
}

export function creatorEligibilityReason(input: CreatorEligibilityInput): string | null {
  if (input.eligible_for_creator_scoring === false) return "explicitly_ineligible";
  if (isNewsOrMediaCreator(input)) return "news_or_media_context_only";
  if (isHybridOrContextOnlyCreator(input)) return "hybrid_or_context_only_pending_review";
  return null;
}
