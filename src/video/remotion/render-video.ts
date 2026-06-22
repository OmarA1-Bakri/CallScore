import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import type { CaptionCue } from "../captions/generate-captions";
import type { CreatorScore, ScenePlan, VideoFormat } from "../schemas/video.schemas";

const compositionByFormat: Record<VideoFormat, string> = {
  daily_short: "CallScoreShortVertical",
  weekly_investigation: "CallScoreInvestigationHorizontal",
  leaderboard_update: "CallScoreLeaderboardVertical",
  creator_breakdown: "CallScoreCreatorBreakdownVertical",
};

export interface RenderVideoInput {
  readonly format: VideoFormat;
  readonly creator: CreatorScore;
  readonly creators: readonly CreatorScore[];
  readonly scenes: readonly ScenePlan[];
  readonly captions: readonly CaptionCue[];
  readonly audioSrc?: string;
  readonly outputPath: string;
}

export async function renderCallScoreVideo(input: RenderVideoInput): Promise<string> {
  const entryPoint = path.join(process.cwd(), "src/video/remotion/Root.tsx");
  const serveUrl = await bundle({ entryPoint });
  const inputProps = { creator: input.creator, creators: input.creators, scenes: input.scenes, captions: input.captions, audioSrc: input.audioSrc };
  const compositions = await getCompositions(serveUrl, { inputProps });
  const composition = compositions.find((item) => item.id === compositionByFormat[input.format]);
  if (!composition) throw new Error(`Missing Remotion composition for format ${input.format}`);
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: input.outputPath, inputProps, onProgress: ({ progress }) => console.log(`render:${Math.round(progress * 100)}%`) });
  return input.outputPath;
}
