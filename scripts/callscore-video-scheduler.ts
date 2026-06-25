import { enqueueScheduledVideoJobs } from "../src/video/queues/scheduler";

async function main() {
  const results = await enqueueScheduledVideoJobs();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
