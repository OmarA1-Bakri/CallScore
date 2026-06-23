import { discoverYoutubeTools } from "../composio/discover-youtube-tools";

const out = await discoverYoutubeTools();
console.log(JSON.stringify({ ok: true, out }, null, 2));
