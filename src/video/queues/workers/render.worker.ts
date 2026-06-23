import fs from "node:fs/promises";
import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { generateCaptions } from "../../captions/generate-captions";
import { renderCallScoreVideo } from "../../remotion/render-video";
import { VideoJobStateSchema } from "../../schemas/video.schemas";

export async function runRenderStage(statePath: string, options: { readonly skipRender?: boolean } = {}): Promise<string> {
  const state = await readVideoJobState(statePath);
  if (!state.selectedCreator) throw new Error("selectedCreator missing before render stage");
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  if (!options.skipRender) {
    const scenes = JSON.parse(await fs.readFile(paths.scenesJson, "utf8"));
    const captions = generateCaptions(scenes);
    await renderCallScoreVideo({
      format: state.format,
      creator: state.selectedCreator,
      creators: state.creators,
      scenes,
      captions,
      audioSrc: state.normalizedAudioPath ?? undefined,
      outputPath: paths.videoMp4,
    });
  }
  const updated = VideoJobStateSchema.parse({ ...state, status: "rendered", videoPath: paths.videoMp4, updatedAt: new Date().toISOString() });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
