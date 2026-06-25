import { z } from "zod";

const IsoDateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
  "Expected an ISO-8601 UTC string",
);

const JsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonPrimitiveSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);

export const CallDirectionSchema = z.enum(["bullish", "bearish", "neutral"]);
export type CallDirection = z.infer<typeof CallDirectionSchema>;

export const CallOutcomeSchema = z.enum([
  "won",
  "lost",
  "open",
  "neutral",
  "unknown",
]);
export type CallOutcome = z.infer<typeof CallOutcomeSchema>;

export const VideoFormatSchema = z.enum([
  "daily_short",
  "weekly_investigation",
  "leaderboard_update",
  "creator_breakdown",
]);
export type VideoFormat = z.infer<typeof VideoFormatSchema>;

export const VideoJobStatusSchema = z.enum([
  "queued",
  "data_loaded",
  "planned",
  "scripted",
  "audio_generated",
  "captions_generated",
  "broll_ready",
  "rendered",
  "thumbnail_generated",
  "qa_passed",
  "published",
  "failed",
]);
export type VideoJobStatus = z.infer<typeof VideoJobStatusSchema>;

export const CallRecordSchema = z.object({
  id: z.number().int().positive(),
  creatorId: z.number().int().positive(),
  videoId: z.number().int().positive().nullable(),
  symbol: z.string().min(1),
  direction: CallDirectionSchema,
  outcome: CallOutcomeSchema,
  rawQuote: z.string().nullable(),
  callDate: IsoDateStringSchema,
  score: z.number(),
  return30d: z.number().nullable(),
  alpha30d: z.number().nullable(),
  extractionConfidence: z.number().min(0).max(1).nullable(),
});
export type CallRecord = z.infer<typeof CallRecordSchema>;

export const CreatorScoreSchema = z.object({
  creatorId: z.number().int().positive(),
  name: z.string().min(1),
  youtubeHandle: z.string().nullable(),
  youtubeChannelId: z.string().nullable(),
  totalCalls: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
  alphaScore: z.number(),
  rank: z.number().int().positive().nullable(),
  scoreDelta: z.number(),
  rankMovement: z.number(),
  recentResolvedCalls: z.number().int().nonnegative(),
  recentCalls: z.array(CallRecordSchema),
});
export type CreatorScore = z.infer<typeof CreatorScoreSchema>;

export const VisualTypeSchema = z.enum([
  "hook",
  "creator_card",
  "score_reveal",
  "stat_reveal",
  "leaderboard",
  "comparison_card",
  "call_timeline",
  "progress_bar",
  "methodology",
  "hero_title",
  "section_title",
  "text_card",
  "particle_overlay",
  "verdict",
  "cta",
  "end_tag",
]);
export type VisualType = z.infer<typeof VisualTypeSchema>;

export const OpenMontageVisualTypeSchema = z.enum([
  "hero_title",
  "stat_reveal",
  "stat_card",
  "comparison_card",
  "end_tag",
  "particle_overlay",
  "progress_bar",
  "section_title",
  "text_card",
]);
export type OpenMontageVisualType = z.infer<typeof OpenMontageVisualTypeSchema>;

export const ThemeNameSchema = z.enum([
  "clean-professional",
  "flat-motion-graphics",
  "minimalist-diagram",
  "anime-ghibli",
]);
export type ThemeName = z.infer<typeof ThemeNameSchema>;

export const ScenePlanSchema = z.object({
  sceneId: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  narration: z.string().min(1),
  durationSeconds: z.number().positive(),
  visualType: VisualTypeSchema,
  dataRefs: z.array(z.string()),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export const ScriptPackageSchema = z.object({
  format: VideoFormatSchema,
  title: z.string().min(1),
  hook: z.string().min(1),
  voiceover: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string()),
  disclaimers: z.array(z.string()),
  cta: z.string().min(1),
});
export type ScriptPackage = z.infer<typeof ScriptPackageSchema>;

export const YoutubeMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(5_000),
  tags: z.array(z.string().min(1)).max(30),
  categoryId: z.string().default("28"),
  madeForKids: z.boolean().default(false),
  language: z.string().default("en"),
});
export type YoutubeMetadata = z.infer<typeof YoutubeMetadataSchema>;

export const QaReportSchema = z.object({
  ok: z.boolean(),
  checkedAt: IsoDateStringSchema,
  format: VideoFormatSchema,
  videoExists: z.boolean(),
  audioStreamPresent: z.boolean(),
  dimensionsOk: z.boolean(),
  durationOk: z.boolean(),
  thumbnailExists: z.boolean(),
  metadataValid: z.boolean(),
  claimsValid: z.boolean(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type QaReport = z.infer<typeof QaReportSchema>;

export const VideoJobStateSchema = z.object({
  jobId: z.string().min(1),
  runDate: IsoDateStringSchema,
  format: VideoFormatSchema,
  status: VideoJobStatusSchema,
  theme: ThemeNameSchema.optional(),
  selectedCreator: CreatorScoreSchema.nullable(),
  creators: z.array(CreatorScoreSchema),
  scriptPackage: ScriptPackageSchema.nullable(),
  audioPath: z.string().nullable(),
  normalizedAudioPath: z.string().nullable(),
  captionsPath: z.string().nullable(),
  srtPath: z.string().nullable(),
  brollManifestPath: z.string().nullable(),
  videoPath: z.string().nullable(),
  thumbnailPath: z.string().nullable(),
  metadata: YoutubeMetadataSchema.nullable(),
  qaReport: QaReportSchema.nullable(),
  youtubeVideoId: z.string().nullable(),
  publishUrl: z.string().nullable(),
  artifactDir: z.string().min(1),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  createdAt: IsoDateStringSchema,
  updatedAt: IsoDateStringSchema,
});
export type VideoJobState = z.infer<typeof VideoJobStateSchema>;

export function isoNow(): string {
  return new Date().toISOString();
}

export function parseVideoJobState(input: unknown): VideoJobState {
  return VideoJobStateSchema.parse(input);
}
