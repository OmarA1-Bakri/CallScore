import fs from "node:fs/promises";
import type { VideoFormat } from "../schemas/video.schemas";
import { ffprobe } from "./ffprobe";

const expected: Record<VideoFormat, { width: number; height: number; minDuration: number; maxDuration: number }> = {
  daily_short: { width: 1080, height: 1920, minDuration: 25, maxDuration: 75 },
  leaderboard_update: { width: 1080, height: 1920, minDuration: 45, maxDuration: 140 },
  creator_breakdown: { width: 1080, height: 1920, minDuration: 25, maxDuration: 140 },
  weekly_investigation: { width: 1920, height: 1080, minDuration: 240, maxDuration: 540 },
};

export async function qaVideo(filePath: string, format: VideoFormat): Promise<{ ok: boolean; errors: string[]; audioStreamPresent: boolean; dimensionsOk: boolean; durationOk: boolean }> {
  const errors: string[] = [];
  let audioStreamPresent = false;
  let dimensionsOk = false;
  let durationOk = false;
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= 0) errors.push("video_file_empty");
    const info = await ffprobe(filePath);
    const video = info.streams.find((stream) => stream.codec_type === "video");
    audioStreamPresent = info.streams.some((stream) => stream.codec_type === "audio");
    const dims = expected[format];
    dimensionsOk = Boolean(video && video.width === dims.width && video.height === dims.height);
    const duration = Number(info.format?.duration ?? 0);
    durationOk = Number.isFinite(duration) && duration >= dims.minDuration && duration <= dims.maxDuration;
    if (!video) errors.push("video_stream_missing");
    if (!audioStreamPresent) errors.push("audio_stream_missing");
    if (!dimensionsOk) errors.push(`video_dimensions:${video?.width ?? 0}x${video?.height ?? 0}`);
    if (!durationOk) errors.push(`video_duration:${duration}`);
  } catch (error) {
    errors.push(`video_probe_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: errors.length === 0, errors, audioStreamPresent, dimensionsOk, durationOk };
}
