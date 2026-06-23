import fs from "node:fs/promises";
import sharp from "sharp";
import type { VideoFormat } from "../schemas/video.schemas";

const expected: Record<VideoFormat, { width: number; height: number }> = {
  daily_short: { width: 1080, height: 1920 },
  leaderboard_update: { width: 1080, height: 1920 },
  creator_breakdown: { width: 1080, height: 1920 },
  weekly_investigation: { width: 1280, height: 720 },
};

export async function qaThumbnail(filePath: string, format: VideoFormat): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= 0) errors.push("thumbnail_file_empty");
    const metadata = await sharp(filePath).metadata();
    const dims = expected[format];
    if (metadata.width !== dims.width || metadata.height !== dims.height) errors.push(`thumbnail_dimensions:${metadata.width}x${metadata.height}`);
  } catch (error) {
    errors.push(`thumbnail_probe_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: errors.length === 0, errors };
}
