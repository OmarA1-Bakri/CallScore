import { readVideoJobState } from "../artifacts/state-store";
import { McpYoutubePublisher } from "../composio/mcp-youtube-publisher";

async function main(): Promise<void> {
  const statePath = process.argv[2];
  if (!statePath) throw new Error("Usage: npm run video:mcp-proof -- <state.json>");
  const state = await readVideoJobState(statePath);
  if (!state.qaReport?.ok) throw new Error("QA must pass before provider proof");
  if (!state.videoPath || !state.thumbnailPath || !state.metadata) throw new Error("videoPath, thumbnailPath, and metadata are required");
  const publisher = new McpYoutubePublisher({ artifactDir: state.artifactDir });
  const result = await publisher.publishVideo({
    jobId: state.jobId,
    videoPath: state.videoPath,
    thumbnailPath: state.thumbnailPath,
    metadata: state.metadata,
    privacyStatus: "private",
    graph_context: state.graph_context,
  });
  console.log(JSON.stringify({ ok: true, youtubeVideoId: result.youtubeVideoId, publishUrl: result.publishUrl, privacyStatus: result.privacyStatus }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
