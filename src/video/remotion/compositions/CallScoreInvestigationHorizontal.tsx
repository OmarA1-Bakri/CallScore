import React from "react";
import { AbsoluteFill, Audio } from "remotion";
import { Captions } from "../components/Captions";
import { BrandFrame } from "../components/BrandFrame";
import { CreatorCard } from "../components/CreatorCard";
import { MethodologyCard } from "../components/MethodologyCard";
import { CallTimeline } from "../components/CallTimeline";
import { CTA } from "../components/CTA";
import type { CallScoreVideoProps } from "./CallScoreShortVertical";
export function CallScoreInvestigationHorizontal({ creator, captions, audioSrc }: CallScoreVideoProps) {
  return <AbsoluteFill>{audioSrc ? <Audio src={audioSrc} /> : null}<BrandFrame title="Investigation"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}><CreatorCard creator={creator}/><div><MethodologyCard/><CallTimeline calls={creator.recentCalls}/><CTA/></div></div></BrandFrame><Captions cues={captions}/></AbsoluteFill>;
}
