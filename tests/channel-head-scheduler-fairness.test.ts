import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT = "/opt/crypto-tuber-ranked/scripts/callscore-daily-orchestrator.sh";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "callscore-fair-scheduler-"));
  const runtime = join(root, "runtime");
  const fakeBin = join(root, "bin");
  mkdirSync(join(runtime, "tasklists"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  const channels = ["cmo", "x", "linkedin", "data", "youtube", "sentinel"];
  const tasklist = {
    schema: "callscore.channel_head_tasklist.v1",
    id: "fairness-fixture",
    date: "2026-07-09",
    max_active: 3,
    channels: channels.map((channel) => ({
      channel,
      profile: "callscore",
      priority: 100,
      tasks: [{ id: `${channel}-task`, prompt: `${channel} read only`, max_duration_seconds: 30 }],
    })),
  };
  writeFileSync(join(runtime, "tasklists", "current.tasklist"), `${JSON.stringify(tasklist)}\n`);
  const tmux = join(fakeBin, "tmux");
  writeFileSync(tmux, `#!/usr/bin/env bash\nset -e\ncase "$1" in\n  has-session|list-sessions) exit 1 ;;\n  new-session) printf '%s\\n' "$*" >> "$FAKE_TMUX_LOG"; exit 0 ;;\n  kill-session) exit 0 ;;\n  *) exit 0 ;;\nesac\n`);
  chmodSync(tmux, 0o755);
  return { root, runtime, fakeBin, channels };
}

function run(runtime: string, fakeBin: string, root: string, mode = "run") {
  return execFileSync("bash", [SCRIPT, mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      CALLSCORE_CHANNEL_HEAD_RUNTIME: runtime,
      CALLSCORE_CHANNEL_HEAD_WRAPPER: "/bin/true",
      CALLSCORE_NOW_UTC: "2026-07-09T23:50:00Z",
      FAKE_TMUX_LOG: join(root, "tmux.log"),
    },
  });
}

test("scheduler rotates fairly across all six channels instead of restarting at the top", () => {
  const { root, runtime, fakeBin } = fixture();
  run(runtime, fakeBin, root);
  run(runtime, fakeBin, root);
  const receipts = readdirSync(join(runtime, "scheduler-receipts"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(runtime, "scheduler-receipts", name), "utf8")));
  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts[0].channels_dispatched, ["cmo", "x", "linkedin"]);
  assert.deepEqual(receipts[1].channels_dispatched, ["data", "youtube", "sentinel"]);
  assert.equal(receipts[1].next_cursor, 0);
});

test("summary reports unique current-tasklist completion instead of cumulative completed directory size", () => {
  const { root, runtime, fakeBin } = fixture();
  mkdirSync(join(runtime, "completed"), { recursive: true });
  writeFileSync(join(runtime, "completed", "run-1.json"), JSON.stringify({ tasklist_id: "fairness-fixture", channel: "cmo", task_id: "cmo-task", run_id: "run-1" }));
  writeFileSync(join(runtime, "completed", "run-2.json"), JSON.stringify({ tasklist_id: "fairness-fixture", channel: "cmo", task_id: "cmo-task", run_id: "run-2" }));
  writeFileSync(join(runtime, "completed", "old.json"), JSON.stringify({ tasklist_id: "old-fixture", channel: "x", task_id: "x-task", run_id: "old" }));
  const summary = JSON.parse(run(runtime, fakeBin, root, "summary"));
  assert.equal(summary.tasklist_id, "fairness-fixture");
  assert.equal(summary.completed_runs_for_tasklist, 2);
  assert.equal(summary.unique_tasks_completed, 1);
  assert.equal(Object.hasOwn(summary, "tasks_completed"), false);
});

test("provider cooldown blocks a scheduler pulse instead of hammering a rate-limited model", () => {
  const { root, runtime, fakeBin } = fixture();
  mkdirSync(join(runtime, "state"), { recursive: true });
  writeFileSync(join(runtime, "state", "provider-cooldown.json"), JSON.stringify({
    schema: "callscore.channel_head_provider_cooldown.v1",
    until_utc: "2026-07-10T00:50:00Z",
    reason: "HTTP_429_usage_limit_reached",
  }));
  run(runtime, fakeBin, root);
  const receiptName = readdirSync(join(runtime, "scheduler-receipts"))[0];
  const receipt = JSON.parse(readFileSync(join(runtime, "scheduler-receipts", receiptName), "utf8"));
  assert.equal(receipt.status, "blocked_provider_cooldown");
  assert.deepEqual(receipt.channels_dispatched, []);
  assert.equal(receipt.next_cursor, 0);
});
