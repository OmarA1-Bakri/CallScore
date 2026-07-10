import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const WATCHER = "/srv/agents/hermes/scripts/callscore-cmo-cooldown-catchup.sh";
const watcherExists = existsSync(WATCHER);

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("CMO cooldown catch-up watcher wakes only the canonical revenue_now job", { skip: !watcherExists }, () => {
  assert.equal(existsSync(WATCHER), true);
  const source = read(WATCHER);
  assert.match(source, /MAIN_JOB_ID="\$\{CALLSCORE_CMO_JOB_ID:-9c03a6eea969\}"/);
  assert.match(source, /hermes cron run --accept-hooks "\$MAIN_JOB_ID"/);
  assert.match(source, /python3 - "\$RECEIPT_DIR" "\$STATE_FILE" "\$GRACE_SECONDS" "\$STALE_AFTER_SECONDS" "\$STALE_RETRY_SECONDS" "\$EXTERNAL_BLOCKER_GRACE_SECONDS" "\$MAIN_JOB_ID"/);
  assert.match(source, /CALLSCORE_CMO_STALE_RETRY_SECONDS:-43200/);
  assert.doesNotMatch(source, /hour_bucket/);
  assert.doesNotMatch(source, /'job_id':'9c03a6eea969'/);
  assert.match(source, /if no_agent and script == 'callscore-genuine-social-packet\.sh':/);
  assert.match(source, /assert_no_direct_provider\(script_text, 'script'\)/);
  assert.match(source, /required_terms = \['npm run operating:goal', '--goal revenue_now', '--draft-only'\]/);
  assert.doesNotMatch(source, /TWITTER_CREATION_OF_A_POST|LINKEDIN_CREATE_LINKED_IN_POST|REDDIT_CREATE_REDDIT_POST/);
  assert.doesNotMatch(source, /cron (create|schedule)/);
});

test("CMO cooldown catch-up watcher is a no-op when no social receipts exist", { skip: !watcherExists }, () => {
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


test("current cooldown receipts with nested prior verified posts do not trigger stale wakeups", { skip: !watcherExists }, () => {
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

test("combined graph-owned publication receipts reconcile verified X and LinkedIn cadence", { skip: !watcherExists }, () => {
  const root = mkdtempSync(join(tmpdir(), "cmo-catchup-combined-publish-"));
  const receiptDir = join(root, "receipts");
  const stateDir = join(root, "state");
  const fs = require("node:fs");
  // nosemgrep
  fs.mkdirSync(receiptDir, { recursive: true });
  const mutationInputsPath = join(receiptDir, "graph-mutation-inputs.json");
  // nosemgrep
  fs.writeFileSync(mutationInputsPath, JSON.stringify({
    x_owned_publish_node: {
      graph_context: { platform: "x", dry_run: false },
      provider_execution_receipt_id: "provider-exec-x",
    },
    linkedin_owned_publish_node: {
      graph_context: { platform: "linkedin", dry_run: false },
      provider_execution_receipt_id: "provider-exec-linkedin",
    },
  }));
  // nosemgrep
  fs.writeFileSync(join(receiptDir, "20990101T000000Z-combined-published_graph_owned.json"), JSON.stringify({
    schema: "callscore.cmo_combined_receipt.v1",
    created_at_utc: "2099-01-01T00:00:00Z",
    status: "published_graph_owned",
    graph_lane_invoked: true,
    public_publish_performed: true,
    provider_mutation_performed: true,
    invoker_result: {
      status: "published_graph_owned",
      mutation_inputs_path: mutationInputsPath,
      mutation_flags: {
        public_publish_performed: true,
        provider_mutation_performed: true,
      },
    },
  }));
  const output = execFileSync(WATCHER, {
    encoding: "utf8",
    env: {
      ...process.env,
      VERBOSE: "1",
      CALLSCORE_CMO_RECEIPT_DIR: receiptDir,
      CALLSCORE_CMO_CATCHUP_STATE_DIR: stateDir,
      CALLSCORE_CMO_JOB_ID: "must-not-run",
    },
  });
  const parsed = JSON.parse(output) as { action: string; reason: string; latest_verified?: Record<string, string> };
  assert.equal(parsed.action, "none");
  assert.equal(parsed.reason, "no_due_trigger");
  assert.equal(parsed.latest_verified?.x, "2099-01-01T00:00:00Z");
  assert.equal(parsed.latest_verified?.linkedin, "2099-01-01T00:00:00Z");
});

test("combined graph-owned status without provider mutation evidence fails closed", { skip: !watcherExists }, () => {
  const root = mkdtempSync(join(tmpdir(), "cmo-catchup-combined-unproved-"));
  const receiptDir = join(root, "receipts");
  const stateDir = join(root, "state");
  const fs = require("node:fs");
  // nosemgrep
  fs.mkdirSync(receiptDir, { recursive: true });
  // nosemgrep
  fs.writeFileSync(join(receiptDir, "20990101T000000Z-combined-published_graph_owned.json"), JSON.stringify({
    schema: "callscore.cmo_combined_receipt.v1",
    created_at_utc: "2099-01-01T00:00:00Z",
    status: "published_graph_owned",
    graph_lane_invoked: true,
    public_publish_performed: false,
    provider_mutation_performed: false,
    invoker_result: {
      status: "published_graph_owned",
      mutation_flags: {
        public_publish_performed: false,
        provider_mutation_performed: false,
      },
    },
  }));
  const output = execFileSync(WATCHER, {
    encoding: "utf8",
    env: {
      ...process.env,
      VERBOSE: "1",
      CALLSCORE_CMO_RECEIPT_DIR: receiptDir,
      CALLSCORE_CMO_CATCHUP_STATE_DIR: stateDir,
      CALLSCORE_CMO_JOB_ID: "must-not-run",
    },
  });
  const parsed = JSON.parse(output) as { action: string; reason: string; latest_verified?: Record<string, string> };
  assert.equal(parsed.action, "none");
  assert.equal(parsed.reason, "no_social_receipts");
  assert.equal(parsed.latest_verified, undefined);
});

test("stale provider wakeups are globally deduplicated across channels for the retry window", { skip: !watcherExists }, () => {
  const root = mkdtempSync(join(tmpdir(), "cmo-catchup-stale-dedupe-"));
  const receiptDir = join(root, "receipts");
  const stateDir = join(root, "state");
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  // nosemgrep
  fs.mkdirSync(receiptDir, { recursive: true });
  // nosemgrep
  fs.mkdirSync(stateDir, { recursive: true });
  for (const channel of ["linkedin", "x"]) {
    // nosemgrep
    fs.writeFileSync(join(receiptDir, `20000101T000000Z-${channel}-published_verified.json`), JSON.stringify({
      channel,
      status: "published_verified",
      provider_verified: true,
      created_at_utc: "2000-01-01T00:00:00Z",
    }));
  }
  const material = "stale_batch:linkedin:2000-01-01T00:00:00+00:00|x:2000-01-01T00:00:00+00:00";
  // nosemgrep
  fs.writeFileSync(join(stateDir, "callscore-cmo-cooldown-catchup.json"), JSON.stringify({
    last_stale_trigger_key: crypto.createHash("sha256").update(material).digest("hex"),
    last_stale_trigger_at_utc: new Date().toISOString(),
  }));
  const output = execFileSync(WATCHER, {
    encoding: "utf8",
    env: {
      ...process.env,
      VERBOSE: "1",
      CALLSCORE_CMO_RECEIPT_DIR: receiptDir,
      CALLSCORE_CMO_CATCHUP_STATE_DIR: stateDir,
      CALLSCORE_CMO_JOB_ID: "must-not-run",
      CALLSCORE_CMO_STALE_AFTER_SECONDS: "0",
      CALLSCORE_CMO_STALE_RETRY_SECONDS: "43200",
    },
  });
  const parsed = JSON.parse(output) as { action: string; reason: string };
  assert.equal(parsed.action, "none");
  assert.equal(parsed.reason, "no_due_trigger");
});
