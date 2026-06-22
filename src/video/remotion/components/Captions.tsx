import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionCue } from "../../captions/generate-captions";
export function Captions({ cues }: { readonly cues: readonly CaptionCue[] }) {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig(); const t = frame / fps;
  const cue = cues.find((c) => t >= c.startSeconds && t <= c.endSeconds);
  if (!cue) return null;
  return <div style={{ position: "absolute", bottom: 120, left: 80, right: 80, background: "rgba(0,0,0,0.72)", color: "white", fontSize: 44, textAlign: "center", padding: 24, borderRadius: 20 }}>{cue.text}</div>;
}
