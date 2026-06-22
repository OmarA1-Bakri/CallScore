import fs from "node:fs/promises";
import { ComposioPublishResultSchema, YoutubePublishInputSchema, type ComposioPublishResult, type YoutubePublishInput } from "../schemas/youtube.schemas";
import type { ComposioToolExecutor } from "./composio-client";

export interface VideoPublisher {
  publishVideo(input: YoutubePublishInput): Promise<ComposioPublishResult>;
}

function extractVideoId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  for (const key of ["id", "videoId", "video_id", "youtubeVideoId"]) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key] as string;
  }
  const data = rec.data;
  if (data && typeof data === "object") return extractVideoId(data);
  return null;
}

export class ComposioYoutubePublisher implements VideoPublisher {
  constructor(private readonly executor: ComposioToolExecutor) {}

  async publishVideo(input: YoutubePublishInput): Promise<ComposioPublishResult> {
    const parsed = YoutubePublishInputSchema.parse(input);
    await fs.access(parsed.videoPath);
    await fs.access(parsed.thumbnailPath);
    const uploadTool = process.env.VIDEO_COMPOSIO_UPLOAD_TOOL || "YOUTUBE_UPLOAD_VIDEO";
    const thumbnailTool = process.env.VIDEO_COMPOSIO_THUMBNAIL_TOOL || "YOUTUBE_UPDATE_THUMBNAIL";
    const rawUpload = await this.executor.executeTool(uploadTool, {
      video_path: parsed.videoPath,
      title: parsed.metadata.title,
      description: parsed.metadata.description,
      tags: parsed.metadata.tags,
      privacy_status: parsed.privacyStatus,
      publish_at: parsed.publishAt ?? null,
      category_id: parsed.metadata.categoryId,
      made_for_kids: parsed.metadata.madeForKids,
    });
    const youtubeVideoId = extractVideoId(rawUpload);
    if (!youtubeVideoId) throw new Error("Composio upload response did not include a YouTube video id");
    let rawThumbnail: unknown = null;
    try {
      rawThumbnail = await this.executor.executeTool(thumbnailTool, { video_id: youtubeVideoId, thumbnail_path: parsed.thumbnailPath });
    } catch (error) {
      rawThumbnail = { warning: error instanceof Error ? error.message : String(error) };
    }
    return ComposioPublishResultSchema.parse({
      jobId: parsed.jobId,
      youtubeVideoId,
      publishUrl: `https://youtu.be/${youtubeVideoId}`,
      privacyStatus: parsed.privacyStatus,
      publishAt: parsed.publishAt ?? null,
      rawResponse: { upload: rawUpload, thumbnail: rawThumbnail },
    });
  }
}
