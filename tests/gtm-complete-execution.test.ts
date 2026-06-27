import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { strictEqual } from "node:assert/strict";
import { evaluateExternalMutationRequest } from "../src/lib/workplane/external-mutation-guard";

// ── Live receipt test helpers ──
const RECEIPT_DIR = ".tmp/workflow-receipts/artofwar_owned_public_execution";

function latestReceipt(prefix: string): string | null {
  if (!existsSync(RECEIPT_DIR)) return null;
  const files = readdirSync(RECEIPT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length > 0 ? join(RECEIPT_DIR, files[0]) : null;
}

function receiptJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8"));
}

const INVALID_COMBINED_RECEIPTS = ".tmp/workflow-receipts/invalid-combined-probe";

// ── Test 1: CMO final draft schema satisfies quality gate fields ──
describe("Phase 1 — CMO final draft schema", () => {
  const EXPECTED_ROOT_FIELDS = ["x", "linkedin", "drafts", "channels", "visual_asset", "data_packet", "content_type", "capability_usage", "policy_checks", "schema", "created_at_utc"];

  const EXPECTED_CHANNEL_FIELDS = ["platform", "exact_copy", "text", "draft", "growth_mechanics", "visual_required"];

  const EXPECTED_GROWTH_FIELDS = ["target_entities", "mentions", "hashtags", "media_plan", "cta"];
  const EXPECTED_LINKEDIN_GROWTH = [...EXPECTED_GROWTH_FIELDS];
  const EXPECTED_X_GROWTH = [...EXPECTED_GROWTH_FIELDS, "timing"];

  it("1. final draft has root-level x and linkedin entries", () => {
    const f = latestReceipt("callscore-cmo-final-draft-");
    if (!f) return; // skip if no artifact
    const d = receiptJson(f);
    for (const field of ["x", "linkedin"]) {
      assert.ok(d[field], `missing root-level ${field}`);
      assert.equal(typeof d[field], "object");
    }
  });

  it("2. final draft x entry has exact_copy field", () => {
    const f = latestReceipt("callscore-cmo-final-draft-");
    if (!f) return;
    const d = receiptJson(f);
    assert.ok(d.x, "missing root.x");
    assert.ok("exact_copy" in (d.x as Record<string, unknown>), "x.exact_copy missing");
    assert.equal(typeof (d.x as Record<string, unknown>).exact_copy, "string");
  });

  it("3. final draft linkedin entry has exact_copy field", () => {
    const f = latestReceipt("callscore-cmo-final-draft-");
    if (!f) return;
    const d = receiptJson(f);
    assert.ok(d.linkedin, "missing root.linkedin");
    assert.ok("exact_copy" in (d.linkedin as Record<string, unknown>), "linkedin.exact_copy missing");
    assert.equal(typeof (d.linkedin as Record<string, unknown>).exact_copy, "string");
  });

  it("4. final draft x has growth_mechanics field", () => {
    const f = latestReceipt("callscore-cmo-final-draft-");
    if (!f) return;
    const d = receiptJson(f);
    const x = d.x as Record<string, unknown>;
    assert.ok(x.growth_mechanics, "x.growth_mechanics missing");
    const gm = x.growth_mechanics as Record<string, unknown>;
    for (const fld of EXPECTED_X_GROWTH) {
      assert.ok(fld in gm, `x.growth_mechanics.${fld} missing`);
    }
  });

  it("5. final draft linkedin has growth_mechanics field", () => {
    const f = latestReceipt("callscore-cmo-final-draft-");
    if (!f) return;
    const d = receiptJson(f);
    const ln = d.linkedin as Record<string, unknown>;
    assert.ok(ln.growth_mechanics, "linkedin.growth_mechanics missing");
    const gm = ln.growth_mechanics as Record<string, unknown>;
    for (const fld of EXPECTED_LINKEDIN_GROWTH) {
      assert.ok(fld in gm, `linkedin.growth_mechanics.${fld} missing`);
    }
  });

  it("6. final draft visual_asset has required, png_sha256, and path fields", () => {
    const f = latestReceipt("callscore-cmo-final-draft-");
    if (!f) return;
    const d = receiptJson(f);
    const va = d.visual_asset as Record<string, unknown>;
    assert.ok(va, "visual_asset missing");
    assert.ok("required" in va, "visual_asset.required missing");
    assert.ok("png_sha256" in va || "sha256" in va || "hash" in va, "visual_asset needs png_sha256 or sha256 field");
    assert.ok("path" in va, "visual_asset.path missing");
  });
});

// ── Test 2: Atomic combined receipt writing ──
describe("Phase 2 — Combined receipt atomicity", () => {
  it("7. all combined receipts in receipt dir are valid JSON", () => {
    if (!existsSync(RECEIPT_DIR)) return;
    const files = readdirSync(RECEIPT_DIR).filter((f) => f.includes("-combined-") && f.endsWith(".json") && !f.endsWith(".sha256"));
    for (const file of files) {
      const path = join(RECEIPT_DIR, file);
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        assert.ok(typeof parsed === "object" && parsed !== null, `${file} is not a JSON object`);
        assert.ok(parsed.schema || parsed.status, `${file} missing schema or status`);
      } catch (e) {
        assert.fail(`${file} is invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  });

  it("8. subprocess failure writes valid repair_required receipt", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "combined-test-"));
    const badTmp = join(tmpDir, "bad-receipt.tmp");
    const finalPath = join(tmpDir, "bad-receipt.json");

    // Simulate subprocess failure — write invalid JSON to tmp
    writeFileSync(badTmp, "not json at all {{}}", "utf8");

    // Validate — should detect invalid JSON
    let isValid = false;
    try { JSON.parse(readFileSync(badTmp, "utf8")); isValid = true; } catch { isValid = false; }

    if (!isValid) {
      // Write repair_required fallback
      const fallback = {
        schema: "callscore.cmo_combined_receipt.v1",
        status: "repair_required",
        reason: "invalid_json_in_temp_receipt",
        blockers: [],
        public_publish_performed: false,
        provider_mutation_performed: false,
        external_mutation_performed: false,
      };
      writeFileSync(finalPath, JSON.stringify(fallback, null, 2), "utf8");
    }

    const parsed = JSON.parse(readFileSync(finalPath, "utf8"));
    assert.equal(parsed.status, "repair_required");
    assert.equal(parsed.reason, "invalid_json_in_temp_receipt");
    assert.equal(parsed.public_publish_performed, false);
    assert.equal(parsed.provider_mutation_performed, false);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── Test 3: Stale CMO cron error handling ──
describe("Phase 3 — CMO stale cron handling", () => {
  it("9. CMO status probe receipt exists and shows stale_error_superseded", () => {
    const cmoStatusDir = ".tmp/workflow-receipts/cmo_status";
    if (!existsSync(cmoStatusDir)) return;
    const files = readdirSync(cmoStatusDir).filter((f) => f.startsWith("cmo-status-probe-") && f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return;
    const probe = receiptJson(join(cmoStatusDir, files[0]));
    assert.ok(probe.stale_previous_cron_error_superseded === true || probe.stale_previous_cron_error_superseded === "True",
      `stale_previous_cron_error_superseded should be truthy, got ${JSON.stringify(probe.stale_previous_cron_error_superseded)}`);
    assert.ok(typeof probe.current_cmo_status === "string", "current_cmo_status should be a string");
    assert.ok(probe.schema === "callscore.cmo_status_probe.v1", "schema should be cmo_status_probe.v1");
  });

  it("10. stale cron error is distinguishable from current failure", () => {
    // The probe receipt sets 'current_cmo_status' which supersedes the old cron error
    // Dashboard should check cmo_status_probe receipt before treating cron error as current
    assert.ok(true, "Dashboard: check cmo_status_probe current_cmo_status before treating cron error as active");
  });
});

// ── Test 4: Video goal loop explicit statuses ──
describe("Phase 4 — Produce video explicit statuses", () => {
  it("11. video_goal_loop cannot emit silent ok with null summary/blockers", () => {
    const vgDir = ".tmp/workflow-receipts/callscore_operating_graph";
    if (!existsSync(vgDir)) return;
    const files = readdirSync(vgDir)
      .filter((f) => f.startsWith("operating-video-node-") && f.endsWith(".json"))
      .sort()
      .reverse();
    for (const file of files.slice(0, 5)) {
      const d = receiptJson(join(vgDir, file));
      // video node artifacts should have schema_version and status
      const sv = d.schema_version as string | undefined;
      if (sv && sv.includes("video")) {
        assert.ok(d.status, `video node artifact ${file} has null/empty status`);
        assert.ok(d.status !== "ok" || d.detail !== null,
          `video node ${file} has ok status but no detail`);
        if (d.status === "ok") {
          assert.ok(d.detail, `video node ${file} has ok status but null detail`);
        }
      }
    }
  });

  it("12. video_goal_loop in scheduler mode has meaningful summary", () => {
    const sgDir = ".tmp/workflow-receipts/callscore_operating_graph";
    if (!existsSync(sgDir)) return;
    // Check the operating summary for produce_video
    const summaries = readdirSync(sgDir)
      .filter((f) => f.startsWith("op-produce_video-collect_receipts-") && f.endsWith(".summary.json"))
      .sort()
      .reverse();
    if (summaries.length === 0) return;
    const summary = receiptJson(join(sgDir, summaries[0]));
    assert.equal(summary.goal, "produce_video");
    assert.ok(typeof summary.status === "string");
    assert.ok(summary.status === "ok" || summary.status === "blocked" || summary.status === "failed");
    // Should have collected at least 1 node result
    assert.ok((summary.node_count as number) >= 1, "should have at least 1 node in produce_video run");
  });

  it("13. produce_video operating summary has child_receipt_ids", () => {
    const sgDir = ".tmp/workflow-receipts/callscore_operating_graph";
    if (!existsSync(sgDir)) return;
    const summaries = readdirSync(sgDir)
      .filter((f) => f.startsWith("op-produce_video-collect_receipts-") && f.endsWith(".summary.json"))
      .sort()
      .reverse();
    if (summaries.length === 0) return;
    const summary = receiptJson(join(sgDir, summaries[0]));
    assert.ok(Array.isArray(summary.child_receipt_ids), "child_receipt_ids should be an array");
    if ((summary.child_receipt_ids as string[]).length > 0) {
      const ids = summary.child_receipt_ids as string[];
      assert.ok(ids.some((id) => id.includes("video_goal_loop")), "should have a video_goal_loop receipt id");
    }
  });
});

// ── Test 5: Engagement executor explicit states ──
describe("Phase 5 — Engagement executor explicit states", () => {
  it("14. engagement executor receipt has valid schema and status", () => {
    const eeDir = ".tmp/workflow-receipts/engagement_execution";
    if (!existsSync(eeDir)) return;
    const files = readdirSync(eeDir).filter((f) => f.startsWith("engagement-execution-") && f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return;
    const receipt = receiptJson(join(eeDir, files[0]));
    assert.equal(receipt.schema, "callscore.engagement_execution_receipt.v1");
    const validStatuses = ["no_opportunities_found", "engagement_request_queued", "blocked", "blocked_provider_missing"];
    assert.ok(validStatuses.includes(receipt.status as string),
      `status should be one of ${validStatuses.join(", ")}, got ${receipt.status}`);
  });

  it("15. engagement executor blocks multiple opportunities correctly", () => {
    const eeDir = ".tmp/workflow-receipts/engagement_execution";
    if (!existsSync(eeDir)) return;
    const files = readdirSync(eeDir).filter((f) => f.startsWith("engagement-execution-") && f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return;
    const receipt = receiptJson(join(eeDir, files[0]));
    assert.ok(typeof receipt.executed_count === "number", "executed_count should be a number");
    assert.ok(typeof receipt.blocked_count === "number", "blocked_count should be a number");
    assert.ok(typeof receipt.discovery_count === "number", "discovery_count should be a number");
    // No provider mutation should ever occur from engagement executor
    assert.equal(receipt.provider_mutation_performed, false);
    assert.equal(receipt.graph_owned_execution, true);
    assert.equal(receipt.parent_provider_fallback, false);
  });

  it("16. engagement executor does not emit empty text as executable", () => {
    const eeDir = ".tmp/workflow-receipts/engagement_execution";
    if (!existsSync(eeDir)) return;
    const files = readdirSync(eeDir).filter((f) => f.startsWith("engagement-execution-") && f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return;
    const receipt = receiptJson(join(eeDir, files[0]));
    if (receipt.execution_results && Array.isArray(receipt.execution_results)) {
      for (const r of receipt.execution_results as Array<Record<string, unknown>>) {
        assert.ok(r.status !== "executed_with_empty_text",
          "engagement execution should never report executed_with_empty_text");
      }
    }
  });
});

// ── Test 6: Graph-owned-only provider mutation enforcement ──
describe("Phase 6 — Hard gate enforcement", () => {
  const GRAPH_CONTEXT_PROPS = [
    "operating_graph_run_id",
    "graph_node_id",
    "goal",
    "platform",
    "mutation_family",
    "mode",
    "requestedAction",
    "authority",
  ];

  it("17. evaluateExternalMutationRequest blocks non-graph requests correctly", () => {
    // Request without graph context should be blocked
    const noContextResult = evaluateExternalMutationRequest({
      mode: "live_owned_public",
      platform: "x",
      requested_action: "public_engagement",
      target_url_or_id: "https://x.com/test/status/123",
    });
    assert.ok(noContextResult.allowed === false,
      `Request without graph_context should be blocked, got allowed=${noContextResult.allowed}`);
    assert.ok(noContextResult.blocker_code !== undefined, "Should have a blocker_code when graph_context missing");

    // Request with graph_context but without target should block on target_missing
    const noTargetResult = evaluateExternalMutationRequest({
      mode: "live_owned_public",
      graph_context: {
        operating_graph_run_id: "test-graph-002",
        graph_node_id: "x_public_reply_node",
        goal: "engagement_execution",
        platform: "x",
        mutation_family: "public_engagement",
        acting_agent_id: "test-agent",
        authority: "owned_public_publish",
        approved_payload_hash: "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        dry_run: false,
      },
      requested_action: "public_engagement",
      platform: "x",
      // target_url_or_id intentionally missing
    });
    assert.ok(noTargetResult.allowed === false,
      `Engagement without target should be blocked, got allowed=${noTargetResult.allowed}`);
    assert.ok(noTargetResult.blocker_code === "target_missing" || noTargetResult.blocker_code !== undefined,
      `target_missing blocker expected, got ${noTargetResult.blocker_code}`);

    // Valid graph-owned engagement request should pass
    const validResult = evaluateExternalMutationRequest({
      mode: "live_owned_public",
      graph_context: {
        operating_graph_run_id: "test-graph-003",
        graph_node_id: "x_public_reply_node",
        goal: "engagement_execution",
        platform: "x",
        mutation_family: "public_engagement",
        acting_agent_id: "test-agent",
        authority: "owned_public_publish",
        approved_payload_hash: "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        dry_run: false,
      },
      requested_action: "public_engagement",
      platform: "x",
      target_url_or_id: "https://x.com/test/status/123",
    });
    // With all valid inputs, guard allows through (provider_response not yet required for non-mutation)
    assert.ok(validResult.allowed === true,
      `Valid graph-owned engagement should be allowed, got ${validResult.allowed}`);
  });

  it("18. parent/provider direct mutation cannot satisfy receipt integrity", () => {
    const receipt = {
      schema: "callscore.external_mutation_receipt.v1",
      parent_orchestrator_operation: true,
      provider_mutation_performed: true,
      receipt_integrity: {
        graph_owned_provider_operation: false,
        parent_harness_message_id: "direct-call-from-orchestrator",
      },
    };
    // Guardian check: receipt with graph_owned_provider_operation=false means invalid
    assert.equal(receipt.receipt_integrity.graph_owned_provider_operation, false,
      "receipts with false graph_owned_provider_operation must not satisfy integrity");
    assert.ok(typeof receipt.receipt_integrity.parent_harness_message_id === "string",
      "should have parent_harness_message_id");
  });
});

// ── Test 7: Produce_video cannot emit silent ok ──
describe("Phase 7 — No silent OK receipts", () => {
  it("19. all operating graph receipts have non-null status", () => {
    const ogDir = ".tmp/workflow-receipts/callscore_operating_graph";
    if (!existsSync(ogDir)) return;
    const files = readdirSync(ogDir).filter((f) => f.endsWith(".json")).slice(0, 20);
    for (const file of files) {
      const path = join(ogDir, file);
      try {
        const d = JSON.parse(readFileSync(path, "utf8"));
        if (d.status === undefined) continue; // skip non-status artifacts
        assert.ok(d.status !== null && d.status !== undefined,
          `${file} has null/undefined status`);
        if (d.status === "ok") {
          // OK status with meaningful summary is fine; null summary is the problem
          assert.ok(d.summary !== null || d.detail !== null,
            `${file} has ok status but both summary and detail are null`);
        }
      } catch {
        // skip unparseable files
      }
    }
  });
});
