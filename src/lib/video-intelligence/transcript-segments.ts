import type { TranscriptSegment } from "./types";

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/g;

export function segmentTranscript(transcript: string): readonly TranscriptSegment[] {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks = normalized.split(SENTENCE_BOUNDARY).map((chunk) => chunk.trim()).filter(Boolean);
  const segments: TranscriptSegment[] = [];
  let cursor = 0;

  for (const [index, text] of chunks.entries()) {
    const startChar = normalized.indexOf(text, cursor);
    const endChar = startChar + text.length;
    segments.push({
      id: `seg-${String(index + 1).padStart(3, "0")}`,
      index,
      startChar,
      endChar,
      text,
    });
    cursor = endChar;
  }

  return segments;
}
