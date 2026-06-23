import { runPublishStage } from "../queues/workers/publish.worker";

const statePath = process.argv[2];
if (!statePath) throw new Error("Usage: npm run video:publish -- <state.json>");
const out = await runPublishStage(statePath);
console.log(JSON.stringify({ ok: true, statePath: out }, null, 2));
