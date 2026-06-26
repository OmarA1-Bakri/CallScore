import { pathToFileURL } from "node:url";
import { runPublishStage } from "../queues/workers/publish.worker";

export function assertDirectVideoPublishCliBlocked(): void {
  throw new Error("non_graph_youtube_mutation_blocked: legacy_video_publish_cli_disabled_use_operating_goal_produce_video");
}

async function main(): Promise<void> {
  const statePath = process.argv[2];
  if (!statePath) throw new Error("Usage: npm run video:publish -- <state.json>");
  assertDirectVideoPublishCliBlocked();
  const out = await runPublishStage(statePath);
  console.log(JSON.stringify({ ok: true, statePath: out }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
