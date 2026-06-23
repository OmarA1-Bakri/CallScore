import { loadVideoAutomationConfig } from "../config/publishing-config";
import { createAndEnqueueVideoJob } from "./video-queues";

export async function enqueueScheduledVideoJobs(now = new Date()): Promise<readonly { format: string; jobId: string; queuePath: string }[]> {
  const config = loadVideoAutomationConfig();
  if (!config.enabled) return [];
  const results: Array<{ format: string; jobId: string; queuePath: string }> = [];
  const daily = await createAndEnqueueVideoJob({ format: "daily_short", artifactRoot: config.artifactsDir, now });
  results.push({ format: "daily_short", jobId: daily.state.jobId, queuePath: daily.queuePath });
  const day = now.getUTCDay();
  if (day === 1) {
    const weekly = await createAndEnqueueVideoJob({ format: "weekly_investigation", artifactRoot: config.artifactsDir, now });
    results.push({ format: "weekly_investigation", jobId: weekly.state.jobId, queuePath: weekly.queuePath });
  }
  if (day === 3) {
    const leaderboard = await createAndEnqueueVideoJob({ format: "leaderboard_update", artifactRoot: config.artifactsDir, now });
    results.push({ format: "leaderboard_update", jobId: leaderboard.state.jobId, queuePath: leaderboard.queuePath });
  }
  return results;
}
