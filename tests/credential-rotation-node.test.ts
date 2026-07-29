import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runCredentialRotationNode } from "../src/lib/workplane/node-wrappers/credential-rotation-node";
import { buildInitialOperatingState, createCallscoreOperatingGraph } from "../src/lib/workplane/callscore-operating-graph";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return nested;
  });
}

function payloadHash(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

function writeSecretGateReceipt(input: {
  providerTool: string;
  providerPayload: Record<string, unknown>;
  credentialNames?: string[];
  approvalReceiptId?: string;
}): { path: string; sha256: string; approvalReceiptId: string } {
  const dir = mkdtempSync(join(tmpdir(), "callscore-secret-gate-"));
  const path = join(dir, "secret-gate-receipt.json");
  const approvalReceiptId = input.approvalReceiptId ?? "secret-gate-approval-test";
  const receipt = {
    schema: "callscore.secret_gate_approval_receipt.v1",
    status: "approved",
    gate: "SECRET_GATE",
    credential_scope: "mutating",
    action: "credential_rotation",
    actor: "operator",
    dispatch_actor: "workplane",
    approval_receipt_id: approvalReceiptId,
    approved_by_operator: "test-operator",
    provider_tool: input.providerTool,
    provider_payload_hash: payloadHash(input.providerPayload),
    credential_names: input.credentialNames ?? ["TEST_API_KEY"],
    source_incident_receipt_sha256: "a".repeat(64),
    created_at_utc: new Date(Date.now() - 1_000).toISOString(),
    expires_at_utc: new Date(Date.now() + 60_000).toISOString(),
  };
  const raw = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(path, raw, { mode: 0o600 });
  return {
    path,
    sha256: createHash("sha256").update(raw).digest("hex"),
    approvalReceiptId,
  };
}

function writeProviderExecutionReceipt(input: Record<string, unknown>): { path: string; sha256: string; receiptId: string } {
  const receiptId = "provider-exec-credential-rotation-test";
  const dir = join(mkdtempSync(join(tmpdir(), "callscore-provider-exec-")), ".tmp", "workflow-receipts", "provider_execution");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${receiptId}.json`);
  const receipt = {
    schema: "callscore.graph_owned_provider_execution_receipt.v1",
    created_at_utc: new Date().toISOString(),
    receipt_id: receiptId,
    provider_action_name: input.provider_tool,
    payload_hash: payloadHash(input.provider_payload),
    provider_account_scope_hash: "c".repeat(64),
    workflow_idempotency_scope: "credential-rotation-test-run:credential_rotation_node",
    ok: true,
    blocker_code: null,
    status_code: 200,
    error: null,
    mutation_outcome: "succeeded",
    provider_response_summary: { ok: true, success: true },
  };
  const raw = `${JSON.stringify(receipt)}\n`;
  writeFileSync(path, raw, { mode: 0o600 });
  return { path, sha256: createHash("sha256").update(raw).digest("hex"), receiptId };
}

function writeReplacementReadbackReceipt(input: { providerTool: string; providerPayload: Record<string, unknown> }): { path: string; sha256: string } {
  const dir = join(mkdtempSync(join(tmpdir(), "callscore-replacement-readback-")), ".tmp", "system-recovery", "credential_rotation");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "replacement-readback.json");
  const receipt = {
    schema: "callscore.credential_replacement_readback_receipt.v1",
    status: "verified",
    verified_at_utc: new Date().toISOString(),
    verified_by: "callscore-system-guardian",
    credential_names: ["TEST_API_KEY"],
    replacement_fingerprint_sha256: "d".repeat(64),
    replacement_in_use_by: ["test-runtime"],
    revoke_provider_tool: input.providerTool,
    revoke_provider_payload_hash: payloadHash(input.providerPayload),
    can_revoke_old: true,
  };
  const raw = `${JSON.stringify(receipt)}\n`;
  writeFileSync(path, raw, { mode: 0o600 });
  return { path, sha256: createHash("sha256").update(raw).digest("hex") };
}

function mutationInput(input?: { omitGate?: boolean; badReceiptHash?: boolean; providerTool?: string }): Record<string, unknown> {
  const providerTool = input?.providerTool ?? "TEST_REVOKE_CREDENTIAL";
  const providerPayload = { credential_name: "TEST_API_KEY", operation: "revoke_old" };
  const gate = writeSecretGateReceipt({ providerTool, providerPayload });
  const replacementReadback = writeReplacementReadbackReceipt({ providerTool, providerPayload });
  return {
    credential_rotation_phase: "revoke_old",
    replacement_readback_receipt_path: replacementReadback.path,
    replacement_readback_receipt_sha256: replacementReadback.sha256,
    graph_context: {
      operating_graph_run_id: "credential-rotation-test-run",
      graph_node_id: "credential_rotation_node",
      goal: "monitor",
      platform: "unknown",
      mutation_family: "provider_mutation",
      acting_agent_id: "callscore-system-guardian",
      authority: "hard_gate",
      approval_receipt_id: gate.approvalReceiptId,
      approved_payload_hash: payloadHash(providerPayload),
      dry_run: false,
      parent_receipt_id: gate.approvalReceiptId,
    },
    approved: true,
    approval_receipt_id: gate.approvalReceiptId,
    provider_tool: providerTool,
    provider_payload: providerPayload,
    payload: providerPayload,
    credential_names: ["TEST_API_KEY"],
    ...(!input?.omitGate ? {
      secret_gate_receipt_path: gate.path,
      secret_gate_receipt_sha256: input?.badReceiptHash ? "b".repeat(64) : gate.sha256,
    } : {}),
  };
}

test("credential rotation blocks without a durable SECRET_GATE receipt before provider execution", () => {
  const decision = runCredentialRotationNode(mutationInput({ omitGate: true }));
  assert.equal(decision.status, "blocked");
  assert.equal(decision.blocker_code, "secret_gate_receipt_missing");
  assert.equal(decision.provider_call_permitted, false);
  assert.equal(decision.mutation_flags.external_mutation_performed, false);
});

test("credential rotation blocks provider-generated replacement creation until a graph-owned secret sink exists", () => {
  const input = mutationInput();
  input.credential_rotation_phase = "create_and_store_replacement";
  const decision = runCredentialRotationNode(input);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.blocker_code, "credential_rotation_secret_sink_unavailable");
  assert.equal(decision.provider_call_permitted, false);
});

test("credential rotation blocks old-credential revocation without replacement readback evidence", () => {
  const input = mutationInput();
  delete input.replacement_readback_receipt_path;
  delete input.replacement_readback_receipt_sha256;
  const decision = runCredentialRotationNode(input);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.blocker_code, "replacement_readback_receipt_missing");
  assert.equal(decision.provider_call_permitted, false);
});

test("revoke_old phase rejects provider tools that can create or rotate replacements", () => {
  const input = mutationInput({ providerTool: "RESEND_CREATE_API_KEY" });
  const decision = runCredentialRotationNode(input);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.blocker_code, "credential_rotation_revoke_tool_invalid");
  assert.equal(decision.provider_call_permitted, false);
});

test("credential rotation blocks when the durable SECRET_GATE receipt bytes drift", () => {
  const decision = runCredentialRotationNode(mutationInput({ badReceiptHash: true }));
  assert.equal(decision.status, "blocked");
  assert.equal(decision.blocker_code, "secret_gate_receipt_hash_mismatch");
  assert.equal(decision.provider_call_permitted, false);
});

test("credential rotation rejects a parent-injected provider success without durable execution evidence", () => {
  const input = mutationInput();
  input.provider_response = { ok: true, success: true };
  input.provider_execution_receipt_id = "provider-exec-credential-rotation-test";
  const decision = runCredentialRotationNode(input);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.blocker_code, "provider_execution_receipt_evidence_missing");
  assert.equal(decision.provider_call_permitted, false);
  assert.equal(decision.mutation_flags.provider_mutation_performed, false);
});

test("credential rotation accepts exact SECRET_GATE and provider-execution evidence", () => {
  const input = mutationInput();
  const providerExecution = writeProviderExecutionReceipt(input);
  input.provider_response = { ok: true, success: true };
  input.provider_execution_receipt_id = providerExecution.receiptId;
  input.provider_execution_receipt_path = providerExecution.path;
  input.provider_execution_receipt_sha256 = providerExecution.sha256;
  const decision = runCredentialRotationNode(input);
  assert.equal(decision.status, "ok");
  assert.equal(decision.provider_call_permitted, true);
  assert.equal(decision.mutation_flags.external_mutation_performed, true);
  assert.equal(decision.mutation_flags.provider_mutation_performed, true);
  assert.equal(decision.mutation_flags.public_publish_performed, false);
});

test("bounded-write operating graph routes credential rotation only through the dedicated graph node", async () => {
  const input = mutationInput({ omitGate: true });
  const graph = createCallscoreOperatingGraph();
  const result = await graph.invoke(buildInitialOperatingState({
    goal: "monitor",
    mode: "bounded_write",
    dryRun: false,
    approved: true,
    approvalReceiptId: "secret-gate-approval-test",
    approvedByOperator: "test-operator",
    testFixtures: true,
    artifacts: { graph_mutation_inputs: { credential_rotation_node: input } },
  }));
  const node = result.node_results.find((candidate) => candidate.node_id === "credential_rotation_node");
  assert.ok(node);
  assert.equal(node.status, "blocked");
  assert.equal(node.detail.blocker_code, "secret_gate_receipt_missing");
  assert.deepEqual(node.detail.provider_calls, []);
  assert.equal(node.mutation_flags.provider_mutation_performed, false);
});
