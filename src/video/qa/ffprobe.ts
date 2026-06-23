import { spawn } from "node:child_process";

export interface FfprobeStream {
  readonly codec_type?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface FfprobeInfo {
  readonly streams: readonly FfprobeStream[];
  readonly format?: { readonly duration?: string };
}

export async function ffprobe(filePath: string): Promise<FfprobeInfo> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath]);
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += String(chunk); });
    child.stderr.on("data", (chunk) => { err += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(out) : reject(new Error(`ffprobe failed ${code}: ${err}`)));
  });
  return JSON.parse(stdout) as FfprobeInfo;
}
