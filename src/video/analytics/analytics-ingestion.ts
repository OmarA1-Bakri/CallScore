import { z } from "zod";
import type { ComposioToolExecutor } from "../composio/composio-client";

export const YoutubeAnalyticsSnapshotSchema = z.object({
  checkedAt: z.string(),
  videoId: z.string(),
  title: z.string().nullable(),
  publishStatus: z.string().nullable(),
  viewCount: z.number().int().nonnegative().nullable(),
  likeCount: z.number().int().nonnegative().nullable(),
  commentCount: z.number().int().nonnegative().nullable(),
  rawResponse: z.unknown(),
});
export type YoutubeAnalyticsSnapshot = z.infer<typeof YoutubeAnalyticsSnapshotSchema>;

function asNullableInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

export async function ingestYoutubeAnalytics(input: { readonly videoId: string; readonly executor: ComposioToolExecutor }): Promise<YoutubeAnalyticsSnapshot> {
  const raw = await input.executor.executeTool("YOUTUBE_GET_VIDEO_DETAILS_BATCH", { id: [input.videoId], parts: ["snippet", "statistics", "status"] });
  const root = raw as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  const items = Array.isArray(data?.items) ? data.items : [];
  const first = (items[0] ?? {}) as Record<string, unknown>;
  const snippet = (first.snippet ?? {}) as Record<string, unknown>;
  const status = (first.status ?? {}) as Record<string, unknown>;
  const stats = (first.statistics ?? {}) as Record<string, unknown>;
  return YoutubeAnalyticsSnapshotSchema.parse({
    checkedAt: new Date().toISOString(),
    videoId: input.videoId,
    title: typeof snippet.title === "string" ? snippet.title : null,
    publishStatus: typeof status.privacyStatus === "string" ? status.privacyStatus : null,
    viewCount: asNullableInt(stats.viewCount),
    likeCount: asNullableInt(stats.likeCount),
    commentCount: asNullableInt(stats.commentCount),
    rawResponse: raw,
  });
}
