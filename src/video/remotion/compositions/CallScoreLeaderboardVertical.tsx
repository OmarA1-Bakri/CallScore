import React from "react";
import { AbsoluteFill, Audio } from "remotion";
import type { CallScoreVideoProps } from "./CallScoreShortVertical";
import { BrandFrame } from "../components/BrandFrame";
import { Captions } from "../components/Captions";
import { Leaderboard } from "../components/Leaderboard";
import { CTA } from "../components/CTA";
export function CallScoreLeaderboardVertical({ creators, captions, audioSrc }: CallScoreVideoProps) {
  return <AbsoluteFill>{audioSrc ? <Audio src={audioSrc}/> : null}<BrandFrame title="Leaderboard"><div style={{ display: "flex", flexDirection: "column", gap: 48, alignItems: "center", width: "100%" }}><Leaderboard creators={creators}/><CTA/></div></BrandFrame><Captions cues={captions}/></AbsoluteFill>;
}
