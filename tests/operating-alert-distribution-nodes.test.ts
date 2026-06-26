import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildInitialOperatingState } from "../src/lib/workplane/callscore-operating-graph";
import {
  createAlertDistributionNode,
  type AlertDistributionMailerPayload,
} from "../src/lib/workplane/node-wrappers/alert-distribution-nodes";
import type { ClaimedAlertRow } from "../src/lib/alerts";

function claimed(overrides: Partial<ClaimedAlertRow> = {}): ClaimedAlertRow {
  return {
    alert_id: 101,
    user_id: "user_a",
    user_email: "user@example.com",
    call_id: 9001,
    creator_id: 42,
    creator_name: "Creator One",
    symbol: "BTC",
    direction: "long",
    call_date: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("alert distribution operating node", () => {
  test("blocks by default before claiming alerts or sending mail", async () => {
    let claims = 0;
    let sends = 0;
    const node = createAlertDistributionNode({
      claimPendingAlerts: async () => {
        claims += 1;
        return [claimed()];
      },
      sendEmail: async () => {
        sends += 1;
      },
      revertClaim: async () => 0,
      hasUsersTable: async () => true,
    });

    const patch = await node(buildInitialOperatingState({ goal: "alerts", testFixtures: true }), {
      configurable: { thread_id: "alerts-default-block-test" },
    });

    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.node_results?.[0]?.blockers.includes("alert_send_policy_missing"), true);
    assert.equal(claims, 0);
    assert.equal(sends, 0);
    assert.equal(patch.mutation_flags?.send_or_outreach_performed, false);
  });

  test("allowSend in read-live without approval blocks before claim or send", async () => {
    const calls: string[] = [];
    const node = createAlertDistributionNode({
      claimPendingAlerts: async () => {
        calls.push("claim");
        return [claimed()];
      },
      sendEmail: async () => {
        calls.push("send");
      },
      revertClaim: async () => {
        calls.push("revert");
        return 0;
      },
      hasUsersTable: async () => {
        calls.push("has-users");
        return true;
      },
    });

    const patch = await node(
      buildInitialOperatingState({
        goal: "alerts",
        mode: "read_live",
        dryRun: false,
        approved: false,
        testFixtures: true,
      }),
      {
        configurable: {
          thread_id: "alerts-read-live-unapproved-test",
          alertDistribution: {
            sendPolicy: {
              allowSend: true,
              toolAvailable: true,
              requireApproval: true,
              policyId: "alert-policy-test",
            },
          },
        },
      },
    );

    assert.deepEqual(calls, []);
    const result = patch.node_results?.[0];
    assert.equal(result?.status, "blocked");
    assert.equal(result?.blockers.includes("alert_send_approval_missing"), true);
    assert.deepEqual(result?.mutation_flags, {
      external_mutation_performed: false,
      send_or_outreach_performed: false,
      provider_mutation_performed: false,
      whop_mutation_performed: false,
      production_mutation_performed: false,
      db_write_performed: false,
      public_publish_performed: false,
    });
  });

  test("approved policy with injected mailer fixture claims builds digest and sends", async () => {
    const sent: AlertDistributionMailerPayload[] = [];
    const node = createAlertDistributionNode({
      claimPendingAlerts: async (limit, hasUsersTable) => {
        assert.equal(limit, 2);
        assert.equal(hasUsersTable, true);
        return [
          claimed({ alert_id: 101, call_id: 9001, creator_id: 42, creator_name: "Creator One" }),
          claimed({ alert_id: 102, call_id: 9002, creator_id: 42, creator_name: "Creator One", symbol: "ETH" }),
        ];
      },
      sendEmail: async (payload) => {
        sent.push(payload);
      },
      revertClaim: async () => 0,
      hasUsersTable: async () => true,
    });

    const patch = await node(
      buildInitialOperatingState({
        goal: "alerts",
        mode: "approved_publish",
        dryRun: false,
        approved: true,
        approvalReceiptId: "send-gate-alerts-1",
        maxItems: 2,
        testFixtures: true,
      }),
      {
        configurable: {
          thread_id: "alerts-approved-send-test",
          alertDistribution: {
            sendPolicy: {
              allowSend: true,
              toolAvailable: true,
              requireApproval: true,
              policyId: "alert-policy-test",
            },
            baseUrl: "https://call-score.com",
          },
        },
      },
    );

    const result = patch.node_results?.[0];
    assert.equal(result?.status, "ok");
    assert.equal(result?.detail.claimed_alert_count, 2);
    assert.equal(result?.detail.sent_alert_count, 2);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Creator One made 2 new calls - CallScore/);
    assert.match(sent[0].text, /BTC/);
    assert.match(sent[0].text, /ETH/);
    assert.equal(patch.mutation_flags?.external_mutation_performed, true);
    assert.equal(patch.mutation_flags?.send_or_outreach_performed, true);
    assert.equal(patch.mutation_flags?.db_write_performed, true);
  });

  test("send failure reverts the claimed alert ids and records blocker", async () => {
    const reverted: number[][] = [];
    const node = createAlertDistributionNode({
      claimPendingAlerts: async () => [claimed({ alert_id: 201 })],
      sendEmail: async () => {
        throw new Error("fixture mailer down");
      },
      revertClaim: async (ids) => {
        reverted.push([...ids]);
        return ids.length;
      },
      hasUsersTable: async () => true,
    });

    const patch = await node(
      buildInitialOperatingState({
        goal: "alerts",
        mode: "approved_publish",
        dryRun: false,
        approved: true,
        approvedByOperator: "operator-alert-test",
        testFixtures: true,
      }),
      {
        configurable: {
          thread_id: "alerts-send-failure-test",
          alertDistribution: {
            sendPolicy: {
              allowSend: true,
              toolAvailable: true,
              requireApproval: true,
              policyId: "alert-policy-test",
            },
          },
        },
      },
    );

    const result = patch.node_results?.[0];
    assert.equal(result?.status, "failed");
    assert.equal(result?.blockers.some((code) => code.includes("fixture mailer down")), true);
    assert.deepEqual(reverted, [[201]]);
    assert.equal(result?.detail.reverted_claim_count, 1);
    assert.equal(patch.mutation_flags?.send_or_outreach_performed, false);
    assert.equal(patch.mutation_flags?.external_mutation_performed, true);
    assert.equal(patch.mutation_flags?.db_write_performed, true);
  });
});
