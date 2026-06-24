export interface ReviewedCreatorExclusion {
  readonly creator_id?: number;
  readonly youtube_handle?: string;
  readonly name?: string;
  readonly reason: "news_media" | "hybrid_unreviewed" | "education_only" | "aggregation";
  readonly reviewed: boolean;
}

export const NEWS_MEDIA_FOCUS_PATTERNS: readonly RegExp[] = [
  /\bnews\b/i,
  /\bjournalism\b/i,
  /\bheadline\b/i,
  /\bmedia\b/i,
  /\breporting\b/i,
  /\binterviews?\b/i,
  /\bfounder interviews?\b/i,
  /\bmarket structure\b/i,
];

export const HYBRID_OR_CONTEXT_FOCUS_PATTERNS: readonly RegExp[] = [
  /\beducation\b/i,
  /\breviews?\b/i,
  /\bcommentary\b/i,
  /\bmacro\b/i,
  /\bpolicy\b/i,
  /\bcontext\b/i,
];

export const CREATOR_CALL_FOCUS_PATTERNS: readonly RegExp[] = [
  /\bcreator calls\b/i,
  /\btrade calls?\b/i,
  /\bprice targets?\b/i,
  /\btechnical analysis\b/i,
  /\bswing setups?\b/i,
  /\bspecific entries\b/i,
  /\bbuy\/sell calls?\b/i,
];

export const REVIEWED_CREATOR_EXCLUSIONS: readonly ReviewedCreatorExclusion[] = [];
