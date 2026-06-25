import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import { hardGatePreflightNode, bootContextNode } from "../src/lib/workplane/node-wrappers/gating-nodes";
import { buildInitialOperatingState } from "../src/lib/workplane/callscore-operating-graph";

describe("operating hard gate nodes", () => {
  test("bootContextNode emits a typed no-mutation boot result", async () => {
    const state = buildInitialOperatingState({ goal: "monitor", testFixtures: true });
    const patch = await bootContextNode(state, { configurable: { thread_id: "boot-test" } });
    assert.equal(patch.node_results?.[0]?.node_id, "boot_context");
    assert.equal(patch.node_results?.[0]?.status, "ok");
    assert.equal(patch.mutation_flags?.external_mutation_performed, false);
  });

  test("hardGatePreflightNode blocks a global kill switch", async () => {
    const state = buildInitialOperatingState({ goal: "monitor", testFixtures: true });
    state.artifacts.kill_switch = { global: true };
    const patch = await hardGatePreflightNode(state, { configurable: { thread_id: "kill-test" } });
    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.blockers?.includes("global_kill_switch_active"), true);
  });

  test("hardGatePreflightNode blocks live approved_publish mode without approval evidence", async () => {
    const state = buildInitialOperatingState({
      goal: "revenue_now",
      mode: "approved_publish",
      dryRun: false,
      approved: false,
      testFixtures: true,
    });
    const patch = await hardGatePreflightNode(state, { configurable: { thread_id: "approval-test" } });
    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.blockers?.includes("approval_missing"), true);
  });

  test("hardGatePreflightNode blocks Workplane BLOCKED status", async () => {
    const state = buildInitialOperatingState({ goal: "monitor", testFixtures: true });
    state.artifacts.workplane_status = { status: "BLOCKED", automation_readiness: "BLOCKED" };
    const patch = await hardGatePreflightNode(state, { configurable: { thread_id: "workplane-test" } });
    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.blockers?.includes("workplane_blocked"), true);
  });

  test("hardGatePreflightNode returns a blocker when Workplane status is missing", async () => {
    const state = buildInitialOperatingState({ goal: "monitor" });
    const patch = await hardGatePreflightNode(state, { configurable: { thread_id: "missing-workplane-test" } });
    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.blockers?.includes("workplane_status_unavailable"), true);
  });

  test("hardGatePreflightNode blocks stale heartbeat freshness", async () => {
    const state = buildInitialOperatingState({ goal: "monitor", testFixtures: true });
    state.artifacts.heartbeat = { heartbeat_id: "hb-stale", fresh: false, lease_expires_at: "2026-06-25T00:00:00.000Z" };
    const patch = await hardGatePreflightNode(state, { configurable: { thread_id: "heartbeat-test" } });
    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.blockers?.includes("heartbeat_stale"), true);
  });

  test("hardGatePreflightNode blocks unknown authority router agent", async () => {
    const state = buildInitialOperatingState({ goal: "revenue_now", mode: "draft_only", testFixtures: true });
    state.artifacts.authority_check = { agent_id: "callscore-unknown-lane-head", target_action_type: "publish_owned_public" };
    const patch = await hardGatePreflightNode(state, { configurable: { thread_id: "authority-test" } });
    assert.equal(patch.node_results?.[0]?.status, "blocked");
    assert.equal(patch.blockers?.includes("unknown_agent_not_authorized"), true);
  });
});
