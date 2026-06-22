import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface TtsInput {
  readonly text: string;
  readonly outputPath: string;
  readonly voice?: string;
  readonly model?: string;
  readonly dtype?: string;
  readonly device?: string;
}

export interface TtsResult {
  readonly ok: boolean;
  readonly engine: "kokoro-js" | "ffmpeg-flite-fallback";
  readonly outputPath: string;
  readonly warnings: readonly string[];
}

async function run(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 1000)}`)));
  });
}

async function synthesizeWithKokoro(input: TtsInput): Promise<void> {
  const mod = await import("kokoro-js");
  const KokoroTTS = (mod as { KokoroTTS: { from_pretrained(model: string, opts: Record<string, unknown>): Promise<unknown> } }).KokoroTTS;
  const tts = await KokoroTTS.from_pretrained(input.model ?? process.env.VIDEO_KOKORO_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: input.dtype ?? process.env.VIDEO_KOKORO_DTYPE ?? "q8",
    device: input.device ?? process.env.VIDEO_KOKORO_DEVICE ?? "cpu",
  });
  const audio = await (tts as { generate(text: string, opts: Record<string, unknown>): Promise<unknown> }).generate(input.text, {
    voice: input.voice ?? process.env.VIDEO_KOKORO_VOICE ?? "af_heart",
  });
  const save = (audio as { save?: (path: string) => Promise<void> }).save;
  if (typeof save === "function") {
    await save.call(audio, input.outputPath);
    return;
  }
  const data = (audio as { data?: Float32Array; audio?: Float32Array }).data ?? (audio as { audio?: Float32Array }).audio;
  if (!data) throw new Error("kokoro-js audio object did not expose save(), data, or audio");
  throw new Error("kokoro-js raw Float32Array WAV serialization not implemented for this package version");
}

async function synthesizeWithFfmpegFlite(input: TtsInput): Promise<void> {
  const safeTextPath = `${input.outputPath}.txt`;
  await fs.writeFile(safeTextPath, input.text.slice(0, 4_000), "utf8");
  const filter = `flite=textfile='${safeTextPath.replace(/'/g, "\\'")}':voice=slt`;
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-ar", "24000", "-ac", "1", input.outputPath]);
  await fs.rm(safeTextPath, { force: true });
}

export async function synthesizeNarration(input: TtsInput): Promise<TtsResult> {
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  const warnings: string[] = [];
  try {
    await synthesizeWithKokoro(input);
    return { ok: true, engine: "kokoro-js", outputPath: input.outputPath, warnings };
  } catch (error) {
    warnings.push(`kokoro-js failed in HH environment: ${error instanceof Error ? error.message : String(error)}`);
    await synthesizeWithFfmpegFlite(input);
    return { ok: true, engine: "ffmpeg-flite-fallback", outputPath: input.outputPath, warnings };
  }
}
