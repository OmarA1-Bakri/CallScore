import fs from "node:fs/promises";
import { ffprobe } from "./ffprobe";

export async function qaAudio(filePath: string): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const stat = await fs.stat(filePath);
    if (stat.size <= 0) errors.push("audio_file_empty");
    const info = await ffprobe(filePath);
    if (!info.streams.some((stream) => stream.codec_type === "audio")) errors.push("audio_stream_missing");
  } catch (error) {
    errors.push(`audio_probe_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: errors.length === 0, errors };
}
