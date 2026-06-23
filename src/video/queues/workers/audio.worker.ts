import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { VideoJobStateSchema } from "../../schemas/video.schemas";
import { synthesizeNarration } from "../../tts/kokoro";
import { normalizeAudio } from "../../tts/normalize-audio";

export async function runAudioStage(statePath: string): Promise<string> {
  const state = await readVideoJobState(statePath);
  if (!state.scriptPackage) throw new Error("scriptPackage missing before audio stage");
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
  const tts = await synthesizeNarration({ text: state.scriptPackage.voiceover, outputPath: paths.audioRawWav });
  await normalizeAudio(paths.audioRawWav, paths.audioNormalizedWav);
  const updated = VideoJobStateSchema.parse({
    ...state,
    status: "audio_generated",
    audioPath: paths.audioRawWav,
    normalizedAudioPath: paths.audioNormalizedWav,
    warnings: [...state.warnings, ...tts.warnings],
    updatedAt: new Date().toISOString(),
  });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });
  return paths.stateJson;
}
