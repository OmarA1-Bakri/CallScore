import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export async function normalizeAudio(inputPath: string, outputPath: string): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-af", "loudnorm=I=-16:LRA=11:TP=-1.5", "-ar", "48000", "-ac", "2", outputPath]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg normalize failed ${code}: ${stderr}`)));
  });
  return outputPath;
}
