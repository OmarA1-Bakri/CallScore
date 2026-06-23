import { createAndEnqueueVideoJob } from "../queues/video-queues";
import { VideoFormatSchema } from "../schemas/video.schemas";

async function main(): Promise<void> {
  const format = VideoFormatSchema.parse(process.argv[2] ?? "daily_short");
  const days = Math.max(1, Math.min(30, Number(process.argv[3] ?? 1)));
  const results = [];
  for (let i = 0; i < days; i++) {
    const now = new Date();
    now.setDate(now.getDate() - i);
    const result = await createAndEnqueueVideoJob({ format, now });
    results.push({ jobId: result.state.jobId, statePath: `${result.state.artifactDir}/state.json`, queuePath: result.queuePath });
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
