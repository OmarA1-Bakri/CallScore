import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { VideoJobStateSchema } from "../../schemas/video.schemas";
import { renderDeterministicThumbnail } from "../../thumbnail/render-thumbnail";

export async function runThumbnailStage(statePath: string): Promise<string> {
  const state = await readVideoJobState(statePath);
  if (!state.selectedCreator) throw new Error("selectedCreator missing before thumbnail stage");
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  await renderDeterministicThumbnail({ format: state.format, creator: state.selectedCreator, pngPath: paths.thumbnailPng, jpgPath: paths.thumbnailJpg });
  const updated = VideoJobStateSchema.parse({ ...state, status: "thumbnail_generated", thumbnailPath: paths.thumbnailJpg, updatedAt: new Date().toISOString() });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
