import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = process.cwd();
const CLI = join(REPO, "src", "scripts", "callscore-leaderboard-sentinel-v2.ts");
const SCHEDULER = join(REPO, "scripts", "callscore-channel-head-scheduler.sh");
const WRAPPER = join(REPO, "scripts", "cs-channel-wrapper.sh");
const LIVE_WRAPPER = "/srv/agents/hermes/scripts/cs-channel-wrapper.sh";

test("deployed channel wrapper matches source-controlled canonical wrapper", () => {
  assert.equal(readFileSync(LIVE_WRAPPER, "utf8"), readFileSync(WRAPPER, "utf8"));
});

test("sentinel v2 CLI enforces a PostgreSQL read-only transaction", () => {
  const source = readFileSync(CLI, "utf8");
  assert.match(source, /withTransaction/);
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  assert.match(pkg.scripts["sentinel:leaderboard:v2"], /callscore-leaderboard-sentinel-v2\.ts/);
});

test("channel scheduler preserves deterministic runner type in active task", () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-sentinel-runner-scheduler-"));
  const runtime = join(root, "runtime");
  const fakeBin = join(root, "bin");
  mkdirSync(join(runtime, "tasklists"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(runtime, "tasklists", "current.tasklist"), JSON.stringify({
    schema: "callscore.channel_head_tasklist.v2",
    id: "runner-fixture",
    max_active: 1,
    channels: [{
      channel: "sentinel",
      profile: "callscore",
      tasks: [{ id: "leaderboard-scan-v2", runner: "sentinel_v2", prompt: "unused", max_duration_seconds: 30 }],
    }],
  }));
  const tmux = join(fakeBin, "tmux");
  writeFileSync(tmux, "#!/usr/bin/env bash\nif [ \"$1\" = list-sessions ]; then exit 1; fi\nexit 0\n");
  chmodSync(tmux, 0o755);
  execFileSync("bash", [SCHEDULER], {
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CALLSCORE_CHANNEL_HEAD_RUNTIME: runtime,
      CALLSCORE_CHANNEL_HEAD_WRAPPER: "/bin/true",
      CALLSCORE_NOW_UTC: "2026-07-15T17:00:00Z",
    },
  });
  const activePath = join(runtime, "active", "sentinel-20260715T170000Z-p000001-leaderboard-scan-v2.json");
  assert.equal(existsSync(activePath), true);
  const active = JSON.parse(readFileSync(activePath, "utf8"));
  assert.equal(active.runner, "sentinel_v2");
});

test("channel wrapper executes sentinel_v2 locally without launching Hermes", { skip: !existsSync(WRAPPER) }, () => {
  const root = mkdtempSync(join(tmpdir(), "callscore-sentinel-local-wrapper-"));
  const runtime = join(root, "runtime");
  const activeDir = join(runtime, "active");
  const fakeBin = join(root, "bin");
  mkdirSync(activeDir, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  const active = join(activeDir, "sentinel-run.json");
  writeFileSync(active, JSON.stringify({
    channel: "sentinel",
    task_id: "leaderboard-scan-v2",
    run_id: "sentinel-test-v2",
    profile: "callscore",
    prompt: "unused",
    runner: "sentinel_v2",
    max_duration_seconds: 30,
    execution_mode: "read_only_verify",
  }));
  const fakeSentinel = join(root, "fake-sentinel.sh");
  writeFileSync(fakeSentinel, "#!/usr/bin/env bash\nprintf '%s\\n' '{\"schema\":\"callscore.sentinel.read_only_scan_receipt.v2\",\"status\":\"GREEN_NO_CHANGES\",\"workflow_status\":\"READ_ONLY_SCAN_COMPLETED\",\"mode\":\"READ_ONLY_NO_MUTATION\"}'\n");
  chmodSync(fakeSentinel, 0o755);
  const tmux = join(fakeBin, "tmux");
  writeFileSync(tmux, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(tmux, 0o755);
  execFileSync("bash", [WRAPPER, active], {
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CALLSCORE_SENTINEL_V2_COMMAND: fakeSentinel,
    },
  });
  const raw = readFileSync(join(runtime, "logs", "sentinel-test-v2.raw.txt"), "utf8");
  assert.match(raw, /callscore\.sentinel\.read_only_scan_receipt\.v2/);
  assert.doesNotMatch(raw, /unsupported for Codex/);
  const receipt = JSON.parse(readFileSync(join(runtime, "receipts", "sentinel-test-v2.runner-receipt.json"), "utf8"));
  assert.equal(receipt.runner_status, "succeeded");
});
