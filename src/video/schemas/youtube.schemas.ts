import { z } from "zod";
import { JsonValueSchema, YoutubeMetadataSchema } from "./video.schemas";

export const YoutubePrivacyStatusSchema = z.enum(["private", "unlisted", "public"]);
export type YoutubePrivacyStatus = z.infer<typeof YoutubePrivacyStatusSchema>;

export const ComposioPublishResultSchema = z.object({
  jobId: z.string().min(1),
  youtubeVideoId: z.string().min(1),
  publishUrl: z.string().nullable(),
  privacyStatus: YoutubePrivacyStatusSchema,
  publishAt: z.string().nullable(),
  rawResponse: JsonValueSchema,
});
export type ComposioPublishResult = z.infer<typeof ComposioPublishResultSchema>;

export const YoutubePublishInputSchema = z.object({
  jobId: z.string().min(1),
  videoPath: z.string().min(1),
  thumbnailPath: z.string().min(1),
  metadata: YoutubeMetadataSchema,
  privacyStatus: YoutubePrivacyStatusSchema,
  publishAt: z.string().optional(),
});
export type YoutubePublishInput = z.infer<typeof YoutubePublishInputSchema>;
