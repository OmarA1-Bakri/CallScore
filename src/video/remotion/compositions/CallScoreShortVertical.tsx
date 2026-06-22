import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import type { CaptionCue } from "../../captions/generate-captions";
import type { CreatorScore, ScenePlan } from "../../schemas/video.schemas";
import { BrandFrame } from "../components/BrandFrame";
import { Captions } from "../components/Captions";
import { CreatorCard } from "../components/CreatorCard";
import { CTA } from "../components/CTA";
import { ScoreBadge } from "../components/ScoreBadge";
import { CallTimeline } from "../components/CallTimeline";

export interface CallScoreVideoProps {
  readonly creator: CreatorScore;
  readonly creators: readonly CreatorScore[];
  readonly scenes: readonly ScenePlan[];
  readonly captions: readonly CaptionCue[];
  readonly audioSrc?: string;
}

export function CallScoreShortVertical({ creator, scenes, captions, audioSrc }: CallScoreVideoProps) {
  const fps = 30;
  let frame = 0;
  return <AbsoluteFill>{audioSrc ? <Audio src={audioSrc} /> : null}<BrandFrame title="Daily Short">
    <Sequence from={frame} durationInFrames={Math.round((scenes[0]?.durationSeconds ?? 8) * fps)}><CreatorCard creator={creator} /></Sequence>
    {void (frame += Math.round((scenes[0]?.durationSeconds ?? 8) * fps))}
    <Sequence from={frame} durationInFrames={Math.round((scenes[1]?.durationSeconds ?? 8) * fps)}><ScoreBadge label="Alpha score" value={Math.round(creator.alphaScore)} /></Sequence>
    {void (frame += Math.round((scenes[1]?.durationSeconds ?? 8) * fps))}
    <Sequence from={frame} durationInFrames={Math.round((scenes[2]?.durationSeconds ?? 8) * fps)}><CallTimeline calls={creator.recentCalls} /></Sequence>
    {void (frame += Math.round((scenes[2]?.durationSeconds ?? 8) * fps))}
    <Sequence from={frame} durationInFrames={180}><CTA /></Sequence>
  </BrandFrame><Captions cues={captions} /></AbsoluteFill>;
}
