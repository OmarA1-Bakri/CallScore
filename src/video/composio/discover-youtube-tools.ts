import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const EXPECTED_YOUTUBE_TOOLS = [
  "YOUTUBE_UPLOAD_VIDEO",
  "YOUTUBE_MULTIPART_UPLOAD_VIDEO",
  "YOUTUBE_UPDATE_THUMBNAIL",
  "YOUTUBE_UPDATE_VIDEO",
  "YOUTUBE_LIST_CHANNELS",
  "YOUTUBE_GET_VIDEO_DETAILS_BATCH",
  "YOUTUBE_LIST_CHANNEL_VIDEOS",
  "YOUTUBE_GET_CHANNEL_STATISTICS",
] as const;

async function runHermesProbe(): Promise<{ ok: boolean; output: string }> {
  return await new Promise((resolve) => {
    const child = spawn("hermes", ["-p", "callscorecmo", "mcp", "test", "composio"], { env: { ...process.env, HERMES_HOME: "/srv/agents/hermes" } });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("close", (code) => resolve({ ok: code === 0, output: output.replace(/ck_[A-Za-z0-9_*-]+/g, "<REDACTED_COMPOSIO_KEY>") }));
  });
}

export async function discoverYoutubeTools(outputPath = ".tmp/workflow-receipts/youtube_automation/composio-youtube-discovery.json"): Promise<string> {
  const probe = await runHermesProbe();
  const result = {
    checkedAt: new Date().toISOString(),
    hermesComposioConnected: probe.ok,
    expectedTools: EXPECTED_YOUTUBE_TOOLS,
    note: "Prompt 9 captures exact YouTube tool targets. Prompt 16 performs real production upload validation with connected account and exact schemas.",
    hermesProbeOutput: probe.output,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return outputPath;
}
