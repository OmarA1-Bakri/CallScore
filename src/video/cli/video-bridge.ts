import fs from "node:fs/promises";
import path from "node:path";
import { buildVideoArtifactPaths } from "../artifacts/artifact-paths";
import { readVideoJobState, writeJsonArtifact } from "../artifacts/state-store";
import { localVideoPathToComposioReference } from "../composio/file-bridge";

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: npm run video:bridge -- <state.json|video.mp4>");
  let videoPath = inputPath;
  let outputPath = path.join(path.dirname(inputPath), "composio-file-bridge.json");
  if (inputPath.endsWith("state.json")) {
    const state = await readVideoJobState(inputPath);
    if (!state.videoPath) throw new Error("state.videoPath is required before bridging");
    videoPath = state.videoPath;
    const paths = buildVideoArtifactPaths(state.jobId, state.artifactDir.split(`/${state.jobId}`)[0]);
    outputPath = path.join(paths.artifactDir, "composio-file-bridge.json");
  }
  await fs.access(videoPath);
  const result = await localVideoPathToComposioReference(videoPath);
  await writeJsonArtifact(outputPath, result.bridgeResult ?? { ok: true, already_bridged: true, bridgedVideoPath: result.bridgedVideoPath } as never, { force: true });
  console.log(JSON.stringify({ ok: true, videoPath, outputPath, bridgedVideoPath: result.bridgedVideoPath.startsWith("{") ? "json-file-object" : result.bridgedVideoPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
