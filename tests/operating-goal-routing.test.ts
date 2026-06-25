import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  normalizeOperatingGoalConfig,
  routeOperatingGoalToDomain,
  routeOperatingGoalToNode,
  operatingGoalRequiresApproval,
} from "../src/lib/workplane/operating-goals";

describe("operating goal routing", () => {
  test("routes every supported goal to a concrete top-level node", () => {
    assert.equal(routeOperatingGoalToNode("revenue_now"), "revenue_goal_loop");
    assert.equal(routeOperatingGoalToNode("refresh_data"), "data_goal_loop");
    assert.equal(routeOperatingGoalToNode("dispatch_worker_once"), "worker_dispatch_goal_loop");
    assert.equal(routeOperatingGoalToNode("produce_video"), "video_goal_loop");
    assert.equal(routeOperatingGoalToNode("monitor"), "monitoring_goal_loop");
    assert.equal(routeOperatingGoalToNode("trust_review"), "trust_goal_loop");
    assert.equal(routeOperatingGoalToNode("alerts"), "alert_goal_loop");
    assert.equal(routeOperatingGoalToNode("evidence_research"), "evidence_goal_loop");
  });

  test("route helpers fail closed for unknown goals", () => {
    assert.throws(() => routeOperatingGoalToDomain("fake" as never), /Unsupported operating goal/);
    assert.throws(() => routeOperatingGoalToNode("fake" as never), /Unsupported operating goal/);
  });

  test("normalizes approved mode without disabling bounded defaults", () => {
    const config = normalizeOperatingGoalConfig({
      goal: "revenue_now",
      mode: "approved_publish",
      dryRun: false,
      approved: true,
      approvalReceiptId: "approval-123",
      maxItems: 5,
    });

    assert.equal(config.goal, "revenue_now");
    assert.equal(config.mode, "approved_publish");
    assert.equal(config.dryRun, false);
    assert.equal(config.approved, true);
    assert.equal(config.bounded, true);
    assert.equal(config.maxItems, 5);
  });

  test("only live mutation modes require approval", () => {
    assert.equal(operatingGoalRequiresApproval(normalizeOperatingGoalConfig({ goal: "monitor" })), false);
    assert.equal(operatingGoalRequiresApproval(normalizeOperatingGoalConfig({ goal: "refresh_data", mode: "dry_run" })), false);
    assert.equal(operatingGoalRequiresApproval(normalizeOperatingGoalConfig({ goal: "revenue_now", mode: "approved_publish", dryRun: false })), true);
    assert.equal(operatingGoalRequiresApproval(normalizeOperatingGoalConfig({ goal: "produce_video", mode: "approved_publish", dryRun: false })), true);
  });
});
