import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCmoResponseLearningReceipt,
  summarizeOwnedPublicExecutionReceipts,
} from "../src/scripts/callscore-cmo-response-monitor";

test("CMO response monitor summarizes owned public receipts without side effects", () => {
  const summary = summarizeOwnedPublicExecutionReceipts([
    { channel: "x", status: "published", post_url: "https://x.com/0/status/1", created_at_utc: "2026-06-20T08:00:00Z", provider_response: { tweet_id: "1" } },
    { channel: "linkedin", status: "published", post_url: "https://linkedin.com/feed/update/1", created_at_utc: "2026-06-20T08:01:00Z", provider_response: { urn: "urn:li:share:1" } },
    { channel: "x", status: "cooldown_skipped", created_at_utc: "2026-06-20T16:00:00Z", provider_response: { not_called: true } },
    { channel: "reddit_owned_profile", status: "blocked_no_text_only", created_at_utc: "2026-06-20T16:00:00Z" },
  ]);

  assert.equal(summary.total_receipts, 4);
  assert.equal(summary.published_count, 2);
  assert.equal(summary.cooldown_skipped_count, 1);
  assert.equal(summary.blocked_count, 1);
  assert.equal(summary.channels.x.published, 1);
  assert.equal(summary.channels.linkedin.published, 1);
  assert.equal(summary.channels.reddit_owned_profile.blocked, 1);
});

test("CMO response monitor receipt is monitor-only and never replies, spends, or mutates providers", () => {
  const receipt = buildCmoResponseLearningReceipt({
    runId: "cmo-response-monitor-test",
    createdAt: "2026-06-20T18:00:00.000Z",
    sourceReceiptPaths: [".tmp/workflow-receipts/artofwar_owned_public_execution/x.json"],
    receipts: [
      { channel: "x", status: "published", post_url: "https://x.com/0/status/1", created_at_utc: "2026-06-20T08:00:00Z", public_post_monitor: { x_public_metrics_refreshed: false } },
      { channel: "x", status: "cooldown_skipped", created_at_utc: "2026-06-20T16:00:00Z", provider_response: { not_called: true } },
    ],
    artifactPath: ".tmp/workflow-receipts/cmo_response_learning_monitor/test.json",
  });

  assert.equal(receipt.workflow_name, "cmo_response_learning_monitor");
  assert.equal(receipt.mode, "read_only_monitor");
  assert.equal(receipt.public_action_performed, false);
  assert.equal(receipt.external_mutation_performed, false);
  assert.equal(receipt.provider_mutation_performed, false);
  assert.equal(receipt.response_learning.status, "MONITOR_ONLY_LIMITED_METRICS");
  assert.ok(receipt.forbidden_actions_not_performed.includes("reply/DM/outreach/send"));
  assert.match(receipt.next_safe_action, /read-only metrics/i);
});
