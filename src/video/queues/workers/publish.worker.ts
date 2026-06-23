import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { loadVideoAutomationConfig, computePublishAt } from "../../config/publishing-config";
import { decidePublish } from "../../qa/publish-decision";
import { VideoJobStateSchema } from "../../schemas/video.schemas";
import { ComposioHttpClient } from "../../composio/composio-client";
import { ComposioYoutubePublisher, type VideoPublisher } from "../../composio/youtube-publisher";

export async function runPublishStage(statePath: string, options: { readonly publisher?: VideoPublisher; readonly env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  const state = await readVideoJobState(statePath);
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  const config = loadVideoAutomationConfig(options.env);
  if (!state.qaReport) throw new Error("qaReport missing before publish stage");
  const decision = decidePublish(config, state.qaReport);
  if (!decision.shouldPublish) {
    await writeJsonArtifact(paths.publishResultJson, { ok: true, published: false, reason: decision.reason }, { force: true });
    return paths.stateJson;
  }
  if (!state.videoPath || !state.thumbnailPath || !state.metadata) throw new Error("publish inputs missing");
  const publisher = options.publisher ?? new ComposioYoutubePublisher(new ComposioHttpClient());
  const result = await publisher.publishVideo({
    jobId: state.jobId,
    videoPath: state.videoPath,
    thumbnailPath: state.thumbnailPath,
    metadata: state.metadata,
    privacyStatus: config.privacyStatus,
    publishAt: computePublishAt({ config }),
  });
  await writeJsonArtifact(paths.publishResultJson, result as never, { force: true });
  const updated = VideoJobStateSchema.parse({ ...state, status: "published", youtubeVideoId: result.youtubeVideoId, publishUrl: result.publishUrl ?? null, updatedAt: new Date().toISOString() });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
