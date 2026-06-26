import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ApprovalBlockerDecisionSchema,
  ExternalMutationRequestSchema,
  MutationFlagsSchema,
  OperatingGoalConfigSchema,
  OperatingGraphStateSchema,
  OperatingNodeResultSchema,
  OperatingReceiptSchema,
  PipelineDispatchJobSchema,
  type OperatingNodeResult,
} from "../src/lib/workplane/operating-graph-schemas";
import {
  OperatingGoalSchema,
  normalizeOperatingGoalConfig,
  routeOperatingGoalToDomain,
} from "../src/lib/workplane/operating-goals";

const now = "2026-06-25T12:00:00.000Z";

function mutationFlags(overrides: Partial<ReturnType<typeof MutationFlagsSchema.parse>> = {}) {
  return MutationFlagsSchema.parse({
    external_mutation_performed: false,
    send_or_outreach_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    db_write_performed: false,
    public_publish_performed: false,
    ...overrides,
  });
}

function nodeResult(overrides: Partial<OperatingNodeResult> = {}): OperatingNodeResult {
  return {
    node_id: "monitor.freshness_check",
    domain: "monitoring",
    status: "ok",
    receipt_id: "receipt-node-001",
    artifact_path: ".tmp/workflow-receipts/callscore_operating_graph/receipt-node-001.json",
    blockers: [],
    warnings: [],
    started_at: now,
    finished_at: "2026-06-25T12:00:01.000Z",
    duration_ms: 1000,
    mutation_flags: mutationFlags(),
    summary: "freshness check completed",
    detail: { source: "fixture" },
    ...overrides,
  };
}

function mutationRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    node_id: "publish.x_owned_post",
    goal: "revenue_now",
    dryRun: false,
    requested_action: "publish_owned_public",
    destination: "x",
    approved: true,
    approvalReceiptId: "approval-001",
    authority: "owned_public_publish",
    required_gate: "PUBLISH_GATE",
    rollback_or_recovery_note: "Delete post by provider id if policy failure is discovered.",
    mutation_flags: mutationFlags({ external_mutation_performed: true, public_publish_performed: true }),
    ...overrides,
  };
}

describe("operating graph schemas", () => {
  test("OperatingGoalSchema and routeOperatingGoalToDomain cover every supported goal", () => {
    const goals = OperatingGoalSchema.options;
    assert.deepEqual(goals.sort(), [
      "alerts",
      "dispatch_worker_once",
      "evidence_research",
      "monitor",
      "produce_video",
      "refresh_data",
      "revenue_now",
      "trust_review",
    ].sort());

    assert.equal(routeOperatingGoalToDomain("revenue_now"), "revenue");
    assert.equal(routeOperatingGoalToDomain("refresh_data"), "data");
    assert.equal(routeOperatingGoalToDomain("dispatch_worker_once"), "worker_dispatch");
    assert.equal(routeOperatingGoalToDomain("produce_video"), "video");
    assert.equal(routeOperatingGoalToDomain("monitor"), "monitoring");
    assert.equal(routeOperatingGoalToDomain("trust_review"), "trust_review");
    assert.equal(routeOperatingGoalToDomain("alerts"), "alerts");
    assert.equal(routeOperatingGoalToDomain("evidence_research"), "evidence_research");
  });

  test("normalizeOperatingGoalConfig defaults to bounded dry-run monitor mode", () => {
    const config = normalizeOperatingGoalConfig({ goal: "monitor" });
    assert.equal(config.goal, "monitor");
    assert.equal(config.mode, "dry_run");
    assert.equal(config.dryRun, true);
    assert.equal(config.approved, false);
    assert.equal(config.bounded, true);
    assert.equal(config.maxItems, 1);
  });

  test("OperatingGoalConfigSchema rejects unknown keys and invalid goals", () => {
    assert.equal(OperatingGoalConfigSchema.safeParse({ goal: "monitor", unknown: true }).success, false);
    assert.equal(OperatingGoalConfigSchema.safeParse({ goal: "fake_goal" }).success, false);
  });

  test("MutationFlagsSchema defaults every mutation surface to false", () => {
    assert.deepEqual(MutationFlagsSchema.parse({}), {
      external_mutation_performed: false,
      send_or_outreach_performed: false,
      provider_mutation_performed: false,
      whop_mutation_performed: false,
      production_mutation_performed: false,
      db_write_performed: false,
      public_publish_performed: false,
      public_engagement_performed: false,
    });
  });

  test("OperatingNodeResultSchema and OperatingReceiptSchema validate receipt lineage", () => {
    const result = OperatingNodeResultSchema.parse(nodeResult());
    assert.equal(result.status, "ok");

    const receipt = OperatingReceiptSchema.parse({
      receipt_id: "receipt-operating-001",
      goal: "monitor",
      domain: "monitoring",
      parent_receipt_ids: [],
      node_results: [result],
      mutation_flags: mutationFlags(),
      approval_receipt_id: null,
      rollback_or_recovery_note: "No rollback; no mutation performed.",
      artifact_paths: [result.artifact_path],
      created_at: now,
    });
    assert.equal(receipt.node_results.length, 1);
  });

  test("OperatingGraphStateSchema rejects inconsistent dry-run mutation state", () => {
    const parsed = OperatingGraphStateSchema.safeParse({
      config: normalizeOperatingGoalConfig({ goal: "monitor", dryRun: true }),
      node_results: [nodeResult({ mutation_flags: mutationFlags({ db_write_performed: true }) })],
      receipts: [],
      blockers: [],
      warnings: [],
      errors: [],
      mutation_flags: mutationFlags({ db_write_performed: true }),
    });
    assert.equal(parsed.success, false);
  });

  test("ExternalMutationRequestSchema blocks dry-run mutations and missing approvals", () => {
    assert.equal(ExternalMutationRequestSchema.safeParse(mutationRequest({ dryRun: true })).success, false);
    assert.equal(ExternalMutationRequestSchema.safeParse(mutationRequest({ approved: false, approvalReceiptId: null })).success, false);
    assert.equal(ExternalMutationRequestSchema.safeParse(mutationRequest({ rollback_or_recovery_note: null })).success, false);
    assert.equal(ExternalMutationRequestSchema.safeParse(mutationRequest()).success, true);
  });

  test("ApprovalBlockerDecisionSchema distinguishes clear owned-public from gated sends", () => {
    const clear = ApprovalBlockerDecisionSchema.parse({
      status: "clear_owned_public",
      required_gate: null,
      blocker_codes: [],
      approval_receipt_required: false,
      allowed_next_action: "publish_owned_public",
      owner_agent: "callscore-x-head",
      rollback_path: "delete provider post by id",
      evidence_refs: ["registry:x"],
    });
    assert.equal(clear.status, "clear_owned_public");

    const gated = ApprovalBlockerDecisionSchema.parse({
      status: "approval_required",
      required_gate: "SEND_GATE",
      blocker_codes: ["send_gate_required"],
      approval_receipt_required: true,
      allowed_next_action: "create_approval_packet",
      owner_agent: "callscore-email-partnership-drafts-head",
      rollback_path: null,
      evidence_refs: [],
    });
    assert.equal(gated.required_gate, "SEND_GATE");
  });

  test("PipelineDispatchJobSchema accepts known dispatch jobs and rejects unknown jobs", () => {
    assert.equal(PipelineDispatchJobSchema.safeParse({ job_type: "candle_refresh", payload: { dry_run: true, max_requests_per_symbol: 3 } }).success, true);
    assert.equal(PipelineDispatchJobSchema.safeParse({ job_type: "artofwar_campaign_dossier", payload: { dry_run: true } }).success, true);
    assert.equal(PipelineDispatchJobSchema.safeParse({ job_type: "totally_unknown", payload: {} }).success, false);
  });

  test("PipelineDispatchJobSchema enforces strict payloads for worker dispatch jobs", () => {
    assert.equal(PipelineDispatchJobSchema.safeParse({
      job_type: "candle_refresh",
      payload: {
        dry_run: true,
        symbols: ["BTCUSDT"],
        start_date: "2026-06-01T00:00:00.000Z",
        max_requests_per_symbol: 1,
        gap_ms: 250,
        write: false,
      },
    }).success, true);

    assert.equal(PipelineDispatchJobSchema.safeParse({
      job_type: "candle_refresh",
      payload: { dry_run: true, unexpected_payload_key: true },
    }).success, false);

    assert.equal(PipelineDispatchJobSchema.safeParse({
      job_type: "match_prices_batch",
      payload: { limit: 0, batch_size: 200 },
    }).success, false);

    assert.equal(PipelineDispatchJobSchema.safeParse({
      job_type: "compute_scores",
      payload: { dry_run: true },
    }).success, false);

    assert.equal(PipelineDispatchJobSchema.safeParse({
      job_type: "promote_ml_verified",
      payload: { write: true, limit: 10 },
    }).success, false);
  });
});
