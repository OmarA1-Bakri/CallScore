import { buildVideoArtifactPaths } from "../../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../../artifacts/state-store";
import { runBrollStage as runBrollCore } from "../../broll/broll-stage";
import { VideoJobStateSchema } from "../../schemas/video.schemas";
import fs from "node:fs/promises";

export async function runBrollStage(statePath: string): Promise<string> {
  const state = await readVideoJobState(statePath);
  const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);

  // Read scenes from the planner output
  const scenes = JSON.parse(await fs.readFile(paths.scenesJson, "utf8"));

  // Run the B-roll stage
  const { manifestPath } = await runBrollCore(scenes, { outputDir: paths.artifactDir });

  // Update state
  const updated = VideoJobStateSchema.parse({
    ...state,
    status: "broll_ready",
    brollManifestPath: manifestPath,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonArtifact(paths.stateJson, updated as never, { force: true });

  return paths.stateJson;
}
