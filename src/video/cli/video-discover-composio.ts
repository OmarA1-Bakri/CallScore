import { discoverYoutubeTools } from "../composio/discover-youtube-tools";

async function main(): Promise<void> {
  const out = await discoverYoutubeTools();
  console.log(JSON.stringify({ ok: true, out }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
