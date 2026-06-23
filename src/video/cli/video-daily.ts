import { loadVideoAutomationConfig } from "../config/publishing-config";
import { createAndEnqueueVideoJob } from "../queues/video-queues";
import { runVideoWorkerPipeline } from "../queues/start-video-workers";

const args = new Set(process.argv.slice(2));
const config = loadVideoAutomationConfig();
const { state } = await createAndEnqueueVideoJob({ format: config.defaultFormat, artifactRoot: config.artifactsDir });
const finalStatePath = await runVideoWorkerPipeline(`${state.artifactDir}/state.json`, {
  mock: args.has("--mock"),
  skipRender: args.has("--skip-render"),
  stopBeforePublish: args.has("--no-publish"),
});
console.log(JSON.stringify({ ok: true, statePath: finalStatePath, artifactDir: state.artifactDir }, null, 2));
