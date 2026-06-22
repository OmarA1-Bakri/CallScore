import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const repoRoot = process.cwd();
const wrapperPath = join(repoRoot, "scripts", "start-whop-auto-workers.sh");

test("whop-auto worker startup wrapper enforces ytdlp singleton guard", () => {
  assert.equal(existsSync(wrapperPath), true, "expected safe whop-auto wrapper to exist");
  const script = readFileSync(wrapperPath, "utf8");
  const executableScript = script
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const mode = statSync(wrapperPath).mode & 0o111;

  assert.notEqual(mode, 0, "wrapper must be executable");
  assert.match(script, /127\.0\.0\.1:4416\/ping/, "wrapper must health-check singleton provider");
  assert.match(script, /crypto-tuber-ranked-ytdlp-pot-provider-1/, "wrapper must verify crypto-owned singleton container");
  assert.match(script, /whop-auto-ytdlp-pot-provider-1/, "wrapper must guard against the duplicate container");
  assert.match(executableScript, /docker compose[\s\S]*-p whop-auto[\s\S]*up -d --no-deps --no-recreate hermes-worker channel-agent-worker/, "wrapper must start only whop-auto workers without dependencies or recreating healthy workers");
  assert.doesNotMatch(executableScript, /docker compose[\s\S]*(?:down|restart)/, "wrapper must not stop or restart the stack");
  assert.doesNotMatch(executableScript, /up -d ytdlp-pot-provider/, "wrapper must not start ytdlp under whop-auto");
  assert.match(script, /--check/, "wrapper must support check-only verification mode");
});
