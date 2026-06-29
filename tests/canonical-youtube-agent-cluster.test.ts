import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { authorityForAgent } from "../src/lib/autonomy/action-authority";

const soulsPath = join(process.cwd(), "docs/ops/callscore-channel-head-souls.yaml");
const sourcePath = join(process.cwd(), "docs/ops/canonical-agent-mapping/callscore_canonical_agent_mapping.source.json");

function loadSouls(): { agents: Array<{ agent_id: string; class?: string; owner_surface?: string }> } {
  const script = "import json, sys, yaml\nprint(json.dumps(yaml.safe_load(open(sys.argv[1]))))";
  return JSON.parse(execFileSync("python3", ["-c", script, soulsPath], { encoding: "utf8" }));
}

const requiredYoutubeAgents = [
  "callscore-youtube-head",
  "callscore-youtube-script-agent",
  "callscore-youtube-packaging-agent",
  "callscore-youtube-thumbnail-agent",
  "callscore-youtube-publishing-agent",
  "callscore-youtube-commenting-agent",
  "callscore-youtube-analytics-agent",
];

test("canonical souls include 44 baseline agents plus 7 justified YouTube production agents", () => {
  const souls = loadSouls();
  assert.equal(souls.agents.length, 51);
  for (const id of requiredYoutubeAgents) {
    assert.ok(souls.agents.some((agent) => agent.agent_id === id), `${id} missing from souls`);
    assert.ok(authorityForAgent(id).length > 0, `${id} must resolve action authority`);
  }
});

test("canonical mapping source and souls agree on new YouTube agent list", () => {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  assert.deepEqual(source.new_agent_summary.new_agents, requiredYoutubeAgents);
});
