import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { ComposioHttpClient } from "../../composio/composio-client";
import { ingestYoutubeAnalytics } from "../../analytics/analytics-ingestion";

export async function runAnalyticsStage(statePath: string): Promise<string> {
  const state = await readVideoJobState(statePath);
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  if (!state.youtubeVideoId) {
    await writeJsonArtifact(`${paths.artifactDir}/analytics-result.json`, { ok: true, skipped: true, reason: "youtube_video_id_missing" }, { force: true });
    return paths.stateJson;
  }
  try {
    const snapshot = await ingestYoutubeAnalytics({ videoId: state.youtubeVideoId, executor: new ComposioHttpClient() });
    await writeJsonArtifact(`${paths.artifactDir}/analytics-result.json`, snapshot as never, { force: true });
  } catch (error) {
    await writeJsonArtifact(`${paths.artifactDir}/analytics-result.json`, { ok: false, warning: error instanceof Error ? error.message : String(error) }, { force: true });
  }
  return paths.stateJson;
}
