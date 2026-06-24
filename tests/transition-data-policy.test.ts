import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTransitionSourceAllowed,
  transitionCanProceedWithGuard,
  transitionDataPolicySummary,
} from "../src/lib/transition/transition-data-policy";
import type { PipelineGuardAudit } from "../src/lib/pipeline-guard-audit";

test("transition policy blocks creator_stats.30d and raw verifier labels", () => {
  assert.throws(() => assertTransitionSourceAllowed("creator_stats.30d"), /raw calls/);
  assert.throws(() => assertTransitionSourceAllowed("raw_ml_verifier_labels"), /label-policy/);
  assert.doesNotThrow(() => assertTransitionSourceAllowed("calls"));
});

test("transition policy allows warn-state guard output when routed around", () => {
  const audit: PipelineGuardAudit = {
    generated_at: "2026-06-24T00:00:00.000Z",
    overall_status: "warn",
    core_pipeline_status: "green",
    transition_readiness: "warn",
    storm_readiness: "warn",
    public_publish_readiness: "warn",
    checks: [
      { id: "creator_stats_30d", status: "warn", summary: "", metrics: {}, next_action: "" },
      { id: "ml_verifier_label_integrity", status: "warn", summary: "", metrics: {}, next_action: "" },
      { id: "daily_closes_lag", status: "warn", summary: "", metrics: {}, next_action: "" },
      { id: "creator_news_channel_exclusion", status: "warn", summary: "", metrics: {}, next_action: "" },
    ],
  };
  assert.equal(transitionCanProceedWithGuard(audit), true);
  assert.match(transitionDataPolicySummary(), /raw calls/);
});

test("transition policy blocks if guard has a block on source integrity", () => {
  const audit: PipelineGuardAudit = {
    generated_at: "2026-06-24T00:00:00.000Z",
    overall_status: "block",
    core_pipeline_status: "green",
    transition_readiness: "blocked",
    storm_readiness: "warn",
    public_publish_readiness: "blocked",
    checks: [{ id: "creator_news_channel_exclusion", status: "block", summary: "", metrics: {}, next_action: "" }],
  };
  assert.equal(transitionCanProceedWithGuard(audit), false);
});
