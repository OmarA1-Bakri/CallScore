import { runPlanStage } from "./workers/plan-video.worker";
import { runAudioStage } from "./workers/audio.worker";
import { runCaptionsStage } from "./workers/captions.worker";
import { runBrollStage } from "./workers/broll.worker";
import { runRenderStage } from "./workers/render.worker";
import { runThumbnailStage } from "./workers/thumbnail.worker";
import { runQaStage } from "./workers/qa.worker";
import { runPublishStage } from "./workers/publish.worker";
import { runAnalyticsStage } from "./workers/analytics.worker";
import type { VideoStage } from "./video-queues";

export async function runVideoStage(stage: VideoStage, statePath: string, options: { readonly mock?: boolean; readonly skipRender?: boolean } = {}): Promise<string> {
  if (stage === "plan") return runPlanStage(statePath, { mock: options.mock, force: true });
  if (stage === "audio") return runAudioStage(statePath);
  if (stage === "captions") return runCaptionsStage(statePath);
  if (stage === "broll") return runBrollStage(statePath);
  if (stage === "render") return runRenderStage(statePath, { skipRender: options.skipRender });
  if (stage === "thumbnail") return runThumbnailStage(statePath);
  if (stage === "qa") return runQaStage(statePath);
  if (stage === "publish") return runPublishStage(statePath);
  if (stage === "analytics") return runAnalyticsStage(statePath);
  throw new Error(`Unsupported video stage: ${stage}`);
}

export async function runVideoWorkerPipeline(statePath: string, options: { readonly mock?: boolean; readonly skipRender?: boolean; readonly stopBeforePublish?: boolean } = {}): Promise<string> {
  let current = statePath;
  for (const stage of ["plan", "audio", "captions", "broll", "render", "thumbnail", "qa"] as const) {
    current = await runVideoStage(stage, current, options);
  }
  if (!options.stopBeforePublish) {
    current = await runVideoStage("publish", current, options);
    current = await runVideoStage("analytics", current, options);
  }
  return current;
}
