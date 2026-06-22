import type { ScenePlan } from "../schemas/video.schemas";

export interface CaptionCue {
  readonly index: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly text: string;
}

function splitCaption(text: string): readonly string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const next = [...current, word].join(" ");
    if (next.length > 54 && current.length > 0) {
      chunks.push(current.join(" "));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks.length ? chunks : [text];
}

export function generateCaptions(scenes: readonly ScenePlan[]): readonly CaptionCue[] {
  let cursor = 0;
  let index = 1;
  const cues: CaptionCue[] = [];
  for (const scene of scenes) {
    const chunks = splitCaption(scene.narration);
    const chunkDuration = scene.durationSeconds / chunks.length;
    for (const chunk of chunks) {
      const startSeconds = cursor;
      const endSeconds = cursor + chunkDuration;
      cues.push({ index: index++, startSeconds, endSeconds, text: chunk });
      cursor = endSeconds;
    }
  }
  return cues;
}
