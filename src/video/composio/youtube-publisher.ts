import { ComposioPublishResultSchema, YoutubePublishInputSchema, type ComposioPublishResult, type YoutubePublishInput } from "../schemas/youtube.schemas";
import type { ComposioToolExecutor } from "./composio-client";

interface ComposioFileObject {
  readonly name: string;
  readonly mimetype: string;
  readonly s3key: string;
}

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

function parseComposioFileObject(value: string, defaultName: string, defaultMimetype: string): ComposioFileObject {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Partial<ComposioFileObject>;
    if (parsed.name && parsed.mimetype && parsed.s3key) return { name: parsed.name, mimetype: parsed.mimetype, s3key: parsed.s3key };
  }
  if (trimmed.startsWith("composio://")) {
    const url = new URL(trimmed);
    const s3key = `${url.host}${url.pathname}`.replace(/^\/+/, "");
    const name = url.searchParams.get("name") || defaultName;
    const mimetype = url.searchParams.get("mimetype") || defaultMimetype;
    if (s3key) return { name, mimetype, s3key };
  }
  throw new Error("Composio YouTube upload schema requires a file object {name,mimetype,s3key}. Local file paths must first be uploaded to Composio file storage or handled by a later file bridge.");
}

function resolveThumbnailUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const fromEnv = process.env.VIDEO_COMPOSIO_THUMBNAIL_URL;
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  throw new Error("YOUTUBE_UPDATE_THUMBNAIL requires thumbnailUrl. Local thumbnail files must first be exposed as a URL or uploaded by a later file bridge.");
}

export class ComposioYoutubePublisher implements VideoPublisher {
  constructor(private readonly executor: ComposioToolExecutor) {}

  async publishVideo(input: YoutubePublishInput): Promise<ComposioPublishResult> {
    const parsed = YoutubePublishInputSchema.parse(input);
    const uploadTool = process.env.VIDEO_COMPOSIO_UPLOAD_TOOL || "YOUTUBE_UPLOAD_VIDEO";
    const updateTool = process.env.VIDEO_COMPOSIO_UPDATE_VIDEO_TOOL || "YOUTUBE_UPDATE_VIDEO";
    const thumbnailTool = process.env.VIDEO_COMPOSIO_THUMBNAIL_TOOL || "YOUTUBE_UPDATE_THUMBNAIL";
    const videoFile = parseComposioFileObject(parsed.videoPath, "video.mp4", "video/mp4");
    const uploadArguments = uploadTool === "YOUTUBE_MULTIPART_UPLOAD_VIDEO"
      ? {
          title: parsed.metadata.title,
          description: parsed.metadata.description,
          tags: parsed.metadata.tags,
          categoryId: parsed.metadata.categoryId,
          privacyStatus: parsed.privacyStatus,
          videoFile,
        }
      : {
          title: parsed.metadata.title,
          description: parsed.metadata.description,
          tags: parsed.metadata.tags,
          categoryId: parsed.metadata.categoryId,
          privacyStatus: parsed.privacyStatus,
          videoFilePath: videoFile,
        };
    const rawUpload = await this.executor.executeTool(uploadTool, uploadArguments);
    const youtubeVideoId = extractVideoId(rawUpload);
    if (!youtubeVideoId) throw new Error("Composio upload response did not include a YouTube video id");
    const rawUpdate = await this.executor.executeTool(updateTool, {
      video_id: youtubeVideoId,
      title: parsed.metadata.title,
      description: parsed.metadata.description,
      tags: parsed.metadata.tags,
      category_id: parsed.metadata.categoryId,
      privacy_status: parsed.privacyStatus,
    });
    let rawThumbnail: unknown = null;
    try {
      rawThumbnail = await this.executor.executeTool(thumbnailTool, { videoId: youtubeVideoId, thumbnailUrl: resolveThumbnailUrl(parsed.thumbnailPath) });
    } catch (error) {
      rawThumbnail = { warning: error instanceof Error ? error.message : String(error) };
    }
    return ComposioPublishResultSchema.parse({
      jobId: parsed.jobId,
      youtubeVideoId,
      publishUrl: `https://youtu.be/${youtubeVideoId}`,
      privacyStatus: parsed.privacyStatus,
      publishAt: parsed.publishAt ?? null,
      rawResponse: { upload: rawUpload, update: rawUpdate, thumbnail: rawThumbnail },
    });
  }
}
