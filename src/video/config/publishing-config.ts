import { z } from "zod";
import { VideoFormatSchema } from "../schemas/video.schemas";
import { YoutubePrivacyStatusSchema } from "../schemas/youtube.schemas";

export const VideoPublishModeSchema = z.enum(["immediate", "scheduled"]);
export type VideoPublishMode = z.infer<typeof VideoPublishModeSchema>;

export const VideoAutomationConfigSchema = z.object({
  enabled: z.boolean(),
  autoPublish: z.boolean(),
  privacyStatus: YoutubePrivacyStatusSchema,
  publishMode: VideoPublishModeSchema,
  scheduleTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
  artifactsDir: z.string().min(1),
  defaultFormat: VideoFormatSchema,
  kokoroModel: z.string().min(1),
  kokoroVoice: z.string().min(1),
  kokoroDtype: z.string().min(1),
  kokoroDevice: z.string().min(1),
  renderConcurrency: z.number().int().positive(),
  forceRender: z.boolean(),
  composioUploadTool: z.string().min(1),
  composioMultipartUploadTool: z.string().min(1),
  composioThumbnailTool: z.string().min(1),
  composioUpdateVideoTool: z.string().min(1),
});
export type VideoAutomationConfig = z.infer<typeof VideoAutomationConfigSchema>;

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadVideoAutomationConfig(env: NodeJS.ProcessEnv = process.env): VideoAutomationConfig {
  return VideoAutomationConfigSchema.parse({
    enabled: boolEnv(env.VIDEO_AUTOMATION_ENABLED, true),
    autoPublish: boolEnv(env.VIDEO_AUTO_PUBLISH, false),
    privacyStatus: env.VIDEO_YOUTUBE_PRIVACY ?? "private",
    publishMode: env.VIDEO_PUBLISH_MODE ?? "immediate",
    scheduleTimeLocal: env.VIDEO_SCHEDULE_TIME_LOCAL ?? "09:00",
    timezone: env.VIDEO_TIMEZONE ?? "Asia/Jakarta",
    artifactsDir: env.VIDEO_ARTIFACTS_DIR ?? "artifacts/video-jobs",
    defaultFormat: env.VIDEO_DEFAULT_FORMAT ?? "daily_short",
    kokoroModel: env.VIDEO_KOKORO_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX",
    kokoroVoice: env.VIDEO_KOKORO_VOICE ?? "af_heart",
    kokoroDtype: env.VIDEO_KOKORO_DTYPE ?? "q8",
    kokoroDevice: env.VIDEO_KOKORO_DEVICE ?? "cpu",
    renderConcurrency: intEnv(env.VIDEO_RENDER_CONCURRENCY, 1),
    forceRender: boolEnv(env.VIDEO_FORCE_RENDER, false),
    composioUploadTool: env.VIDEO_COMPOSIO_UPLOAD_TOOL ?? "YOUTUBE_UPLOAD_VIDEO",
    composioMultipartUploadTool: env.VIDEO_COMPOSIO_MULTIPART_UPLOAD_TOOL ?? "YOUTUBE_MULTIPART_UPLOAD_VIDEO",
    composioThumbnailTool: env.VIDEO_COMPOSIO_THUMBNAIL_TOOL ?? "YOUTUBE_UPDATE_THUMBNAIL",
    composioUpdateVideoTool: env.VIDEO_COMPOSIO_UPDATE_VIDEO_TOOL ?? "YOUTUBE_UPDATE_VIDEO",
  });
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedLocalToUtc(input: { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly timeZone: string }): Date {
  const guessedUtc = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0));
  const offset = timeZoneOffsetMs(guessedUtc, input.timeZone);
  return new Date(guessedUtc.getTime() - offset);
}

export function computePublishAt(input: { readonly now?: Date; readonly config: VideoAutomationConfig }): string | undefined {
  if (input.config.publishMode === "immediate") return undefined;
  const now = input.now ?? new Date();
  const [hourText, minuteText] = input.config.scheduleTimeLocal.split(":");
  const localNow = zonedParts(now, input.config.timezone);
  let candidate = zonedLocalToUtc({
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
    hour: Number(hourText),
    minute: Number(minuteText),
    timeZone: input.config.timezone,
  });
  if (candidate.getTime() <= now.getTime()) {
    candidate = zonedLocalToUtc({
      year: localNow.year,
      month: localNow.month,
      day: localNow.day + 1,
      hour: Number(hourText),
      minute: Number(minuteText),
      timeZone: input.config.timezone,
    });
  }
  return candidate.toISOString();
}
