import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const WATCHER = "/srv/agents/hermes/scripts/callscore-cmo-cooldown-catchup.sh";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("CMO cooldown catch-up watcher wakes only the canonical revenue_now job", () => {
  assert.equal(existsSync(WATCHER), true);
  const source = read(WATCHER);
  assert.match(source, /MAIN_JOB_ID="\$\{CALLSCORE_CMO_JOB_ID:-9c03a6eea969\}"/);
  assert.match(source, /hermes cron run --accept-hooks "\$MAIN_JOB_ID"/);
  assert.match(source, /python3 - "\$RECEIPT_DIR" "\$STATE_FILE" "\$GRACE_SECONDS" "\$STALE_AFTER_SECONDS" "\$EXTERNAL_BLOCKER_GRACE_SECONDS" "\$MAIN_JOB_ID"/);
  assert.doesNotMatch(source, /'job_id':'9c03a6eea969'/);
  assert.doesNotMatch(source, /callscore-genuine-social-packet\.sh/);
  assert.doesNotMatch(source, /TWITTER_CREATION_OF_A_POST|LINKEDIN_CREATE_LINKED_IN_POST|REDDIT_CREATE_REDDIT_POST/);
  assert.doesNotMatch(source, /cron (create|schedule)/);
});

test("CMO cooldown catch-up watcher is a no-op when no social receipts exist", () => {
  const root = mkdtempSync(join(tmpdir(), "cmo-catchup-noop-"));
  const receiptDir = join(root, "receipts");
  const stateDir = join(root, "state");
  const output = execFileSync(WATCHER, {
    encoding: "utf8",
    env: {
      ...process.env,
      VERBOSE: "1",
      CALLSCORE_CMO_RECEIPT_DIR: receiptDir,
      CALLSCORE_CMO_CATCHUP_STATE_DIR: stateDir,
      CALLSCORE_CMO_JOB_ID: "test-main-cmo-job",
    },
  });
  const parsed = JSON.parse(output) as { action: string; reason: string };
  assert.equal(parsed.action, "none");
  assert.equal(parsed.reason, "no_social_receipts");
});


test("current cooldown receipts with nested prior verified posts do not trigger stale wakeups", () => {
  const root = mkdtempSync(join(tmpdir(), "cmo-catchup-current-cooldown-"));
  const receiptDir = join(root, "receipts");
  const stateDir = join(root, "state");
  require("node:fs").mkdirSync(receiptDir, { recursive: true });
  require("node:fs").writeFileSync(join(receiptDir, "20260626T201028Z-x-cooldown_skipped_no_provider_mutation.json"), JSON.stringify({
    status: "cooldown_skipped_no_provider_mutation",
    created_at_utc: "2099-01-01T00:00:00Z",
    earliest_safe_reconsideration_utc: "2099-01-01T12:00:00Z",
    prior_posts: {
      x: {
        status: "published_verified",
        created_at_utc: "2099-01-01T00:00:00Z",
        post_url: "https://x.com/example/status/1"
      }
    }
  }));
  require("node:fs").writeFileSync(join(receiptDir, "20260626T201028Z-linkedin-cooldown_skipped_no_provider_mutation.json"), JSON.stringify({
    status: "cooldown_skipped_no_provider_mutation",
    created_at_utc: "2099-01-01T00:00:00Z",
    earliest_safe_reconsideration_utc: "2099-01-01T12:00:00Z",
    prior_posts: {
      linkedin: {
        status: "published_create_verified_readback_forbidden",
        created_at_utc: "2099-01-01T00:00:00Z",
        post_urn: "urn:li:share:1"
      }
    }
  }));
  const output = execFileSync(WATCHER, {
    encoding: "utf8",
    env: {
      ...process.env,
      VERBOSE: "1",
      CALLSCORE_CMO_RECEIPT_DIR: receiptDir,
      CALLSCORE_CMO_CATCHUP_STATE_DIR: stateDir,
      CALLSCORE_CMO_JOB_ID: "test-main-cmo-job",
    },
  });
  const parsed = JSON.parse(output) as { action: string; reason: string; latest_verified?: Record<string, string> };
  assert.equal(parsed.action, "none");
  assert.equal(parsed.reason, "no_due_trigger");
  assert.equal(parsed.latest_verified?.x, "2099-01-01T00:00:00Z");
  assert.equal(parsed.latest_verified?.linkedin, "2099-01-01T00:00:00Z");
});
