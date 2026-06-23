import React from "react";
import { Composition, registerRoot } from "remotion";
import { CallScoreShortVertical, type CallScoreVideoProps } from "./compositions/CallScoreShortVertical";
import { CallScoreInvestigationHorizontal } from "./compositions/CallScoreInvestigationHorizontal";
import { CallScoreLeaderboardVertical } from "./compositions/CallScoreLeaderboardVertical";
import { CallScoreCreatorBreakdownVertical } from "./compositions/CallScoreCreatorBreakdownVertical";

const emptyProps = { creator: undefined, creators: [], scenes: [], captions: [] } as unknown as CallScoreVideoProps;
const Short = (props: Record<string, unknown>) => <CallScoreShortVertical {...(props as unknown as CallScoreVideoProps)} />;
const Investigation = (props: Record<string, unknown>) => <CallScoreInvestigationHorizontal {...(props as unknown as CallScoreVideoProps)} />;
const Leaderboard = (props: Record<string, unknown>) => <CallScoreLeaderboardVertical {...(props as unknown as CallScoreVideoProps)} />;
const Breakdown = (props: Record<string, unknown>) => <CallScoreCreatorBreakdownVertical {...(props as unknown as CallScoreVideoProps)} />;

export function RemotionRoot() {
  return <>
    <Composition id="CallScoreShortVertical" component={Short} durationInFrames={1800} fps={30} width={1080} height={1920} defaultProps={emptyProps as unknown as Record<string, unknown>} />
    <Composition id="CallScoreInvestigationHorizontal" component={Investigation} durationInFrames={14400} fps={30} width={1920} height={1080} defaultProps={emptyProps as unknown as Record<string, unknown>} />
    <Composition id="CallScoreLeaderboardVertical" component={Leaderboard} durationInFrames={3600} fps={30} width={1080} height={1920} defaultProps={emptyProps as unknown as Record<string, unknown>} />
    <Composition id="CallScoreCreatorBreakdownVertical" component={Breakdown} durationInFrames={3600} fps={30} width={1080} height={1920} defaultProps={emptyProps as unknown as Record<string, unknown>} />
  </>;
}

registerRoot(RemotionRoot);
