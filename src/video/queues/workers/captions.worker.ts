import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { generateCaptions } from "../../captions/generate-captions";
import { captionsToSrt } from "../../captions/write-srt";
import { VideoJobStateSchema } from "../../schemas/video.schemas";
import fs from "node:fs/promises";

export async function runCaptionsStage(statePath: string): Promise<string> {
  const state = await readVideoJobState(statePath);
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  const scenes = JSON.parse(await fs.readFile(paths.scenesJson, "utf8"));
  const captions = generateCaptions(scenes);
  await writeJsonArtifact(paths.captionsJson, captions as never, { force: true });
  await fs.writeFile(paths.captionsSrt, captionsToSrt(captions), "utf8");
  const updated = VideoJobStateSchema.parse({ ...state, status: "captions_generated", captionsPath: paths.captionsJson, srtPath: paths.captionsSrt, updatedAt: new Date().toISOString() });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
