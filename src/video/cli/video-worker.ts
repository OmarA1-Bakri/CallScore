import { runVideoStage, runVideoWorkerPipeline } from "../queues/start-video-workers";
import { VideoStageSchema } from "./video-worker.types";

const statePath = process.argv[2];
const stageArg = process.argv[3] ?? "all";
if (!statePath) throw new Error("Usage: npm run video:worker -- <state.json> [stage|all]");
const args = new Set(process.argv.slice(4));
const out = stageArg === "all"
  ? await runVideoWorkerPipeline(statePath, { mock: args.has("--mock"), skipRender: args.has("--skip-render"), stopBeforePublish: args.has("--no-publish") })
  : await runVideoStage(VideoStageSchema.parse(stageArg), statePath, { mock: args.has("--mock"), skipRender: args.has("--skip-render") });
console.log(JSON.stringify({ ok: true, statePath: out }, null, 2));
