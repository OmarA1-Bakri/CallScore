import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HELPER = "/opt/crypto-tuber-ranked/scripts/callscore-read-active-json.py";
const COOLDOWN_HELPER = "/opt/crypto-tuber-ranked/scripts/callscore-record-provider-cooldown.py";
const WRAPPER = "/srv/agents/hermes/scripts/cs-channel-wrapper.sh";

test("active task JSON normalizes null model to empty and arrays to comma-separated CLI values", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-active-json-"));
  const file = join(root, "active.json");
  writeFileSync(file, JSON.stringify({ model: null, skills: ["callscore-startup", "callscore-canonical-runtime"], toolsets: "terminal,file" }));
  assert.equal(execFileSync("python3", [HELPER, file, "model", "scalar"], { encoding: "utf8" }), "");
  assert.equal(execFileSync("python3", [HELPER, file, "skills", "csv"], { encoding: "utf8" }), "callscore-startup,callscore-canonical-runtime");
  assert.equal(execFileSync("python3", [HELPER, file, "toolsets", "csv"], { encoding: "utf8" }), "terminal,file");
});

test("channel wrapper uses normalized JSON reader instead of Python repr", { skip: !existsSync(WRAPPER) }, () => {
  const source = readFileSync(WRAPPER, "utf8");
  assert.match(source, /callscore-read-active-json\.py/);
  assert.doesNotMatch(source, /print\(json\.load\(open\('\$ACTIVE_FILE'\)\)\.get/);
  assert.match(source, /callscore-record-provider-cooldown\.py/);
});

test("rate-limit output creates a bounded provider cooldown receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-provider-cooldown-"));
  const raw = join(root, "raw.txt");
  const state = join(root, "provider-cooldown.json");
  writeFileSync(raw, "API call failed after 3 retries: HTTP 429: The usage limit has been reached\n");
  execFileSync("python3", [COOLDOWN_HELPER, raw, state, "run-429"], {
    env: { ...process.env, CALLSCORE_NOW_UTC: "2026-07-10T00:00:00Z", CALLSCORE_PROVIDER_COOLDOWN_SECONDS: "3600" },
  });
  const receipt = JSON.parse(readFileSync(state, "utf8"));
  assert.equal(receipt.reason, "HTTP_429_usage_limit_reached");
  assert.equal(receipt.until_utc, "2026-07-10T01:00:00Z");
  assert.deepEqual(receipt.source_runs, ["run-429"]);
});
