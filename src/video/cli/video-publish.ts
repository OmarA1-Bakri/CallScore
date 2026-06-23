import { runPublishStage } from "../queues/workers/publish.worker";

async function main(): Promise<void> {
  const statePath = process.argv[2];
  if (!statePath) throw new Error("Usage: npm run video:publish -- <state.json>");
  const out = await runPublishStage(statePath);
  console.log(JSON.stringify({ ok: true, statePath: out }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
