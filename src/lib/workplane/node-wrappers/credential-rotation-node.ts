import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";
import { runGraphOwnedMutationNode, type GraphOwnedMutationDecision } from "./external-mutation-node-utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return nested;
  });
}

function payloadHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sortedUniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((item) => typeof item !== "string" || !item.trim())) return null;
  return [...new Set(value.map((item) => String(item).trim()))].sort();
}

function blocked(blockerCode: string): GraphOwnedMutationDecision {
  return {
    status: "blocked",
    blocker_code: blockerCode,
    node_id: "credential_rotation_node",
    provider_call_permitted: false,
    provider_calls: [],
    mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
  };
}

function approvalReceiptId(input: Record<string, unknown>): string | null {
  const direct = nonEmptyString(input.approval_receipt_id);
  if (direct) return direct;
  const context = isRecord(input.graph_context) ? input.graph_context : null;
  return context ? nonEmptyString(context.approval_receipt_id) : null;
}

function secretGateReceiptBlocker(input: Record<string, unknown>): string | null {
  const path = nonEmptyString(input.secret_gate_receipt_path);
  const expectedSha256 = nonEmptyString(input.secret_gate_receipt_sha256);
  if (!path || !expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    return "secret_gate_receipt_missing";
  }

  let raw: string;
  let receipt: Record<string, unknown>;
  try {
    raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return "secret_gate_receipt_invalid";
    receipt = parsed;
  } catch {
    return "secret_gate_receipt_unreadable";
  }

  if (createHash("sha256").update(raw).digest("hex") !== expectedSha256) {
    return "secret_gate_receipt_hash_mismatch";
  }

  const createdAt = typeof receipt.created_at_utc === "string" ? Date.parse(receipt.created_at_utc) : Number.NaN;
  const expiresAt = typeof receipt.expires_at_utc === "string" ? Date.parse(receipt.expires_at_utc) : Number.NaN;
  const providerTool = nonEmptyString(input.provider_tool);
  const providerPayload = input.provider_payload;
  const credentialNames = sortedUniqueStrings(input.credential_names);
  const approvedCredentialNames = sortedUniqueStrings(receipt.credential_names);
  const receiptApprovalId = nonEmptyString(receipt.approval_receipt_id);
  const expectedApprovalId = approvalReceiptId(input);

  if (
    receipt.schema !== "callscore.secret_gate_approval_receipt.v1"
    || receipt.status !== "approved"
    || receipt.gate !== "SECRET_GATE"
    || receipt.credential_scope !== "mutating"
    || receipt.action !== "credential_rotation"
    || !["operator", "founder"].includes(String(receipt.actor ?? ""))
    || receipt.dispatch_actor !== "workplane"
    || !nonEmptyString(receipt.approved_by_operator)
    || !/^[a-f0-9]{64}$/.test(String(receipt.source_incident_receipt_sha256 ?? ""))
    || !providerTool
    || !credentialNames
    || !approvedCredentialNames
    || !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || createdAt > Date.now()
  ) {
    return "secret_gate_receipt_invalid";
  }
  if (expiresAt <= Date.now()) return "secret_gate_receipt_expired";
  if (!expectedApprovalId || receiptApprovalId !== expectedApprovalId) return "secret_gate_receipt_binding_mismatch";
  if (receipt.provider_tool !== providerTool) return "secret_gate_receipt_binding_mismatch";
  if (receipt.provider_payload_hash !== payloadHash(providerPayload)) return "secret_gate_receipt_binding_mismatch";
  if (stableJson(approvedCredentialNames) !== stableJson(credentialNames)) return "secret_gate_receipt_binding_mismatch";
  return null;
}

function replacementReadbackBlocker(input: Record<string, unknown>): string | null {
  const path = nonEmptyString(input.replacement_readback_receipt_path);
  const expectedSha256 = nonEmptyString(input.replacement_readback_receipt_sha256);
  if (!path || !expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    return "replacement_readback_receipt_missing";
  }
  if (!path.includes("/.tmp/system-recovery/")) return "replacement_readback_receipt_invalid";

  let raw: string;
  let receipt: Record<string, unknown>;
  try {
    raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return "replacement_readback_receipt_invalid";
    receipt = parsed;
  } catch {
    return "replacement_readback_receipt_unreadable";
  }
  if (createHash("sha256").update(raw).digest("hex") !== expectedSha256) {
    return "replacement_readback_receipt_hash_mismatch";
  }

  const verifiedAt = Date.parse(nonEmptyString(receipt.verified_at_utc) ?? "");
  const now = Date.now();
  if (!Number.isFinite(verifiedAt) || verifiedAt < now - 60 * 60_000 || verifiedAt > now + 5 * 60_000) {
    return "replacement_readback_receipt_stale";
  }
  const credentialNames = sortedUniqueStrings(input.credential_names);
  const receiptNames = sortedUniqueStrings(receipt.credential_names);
  if (
    receipt.schema !== "callscore.credential_replacement_readback_receipt.v1"
    || receipt.status !== "verified"
    || receipt.verified_by !== "callscore-system-guardian"
    || receipt.can_revoke_old !== true
    || receipt.revoke_provider_tool !== nonEmptyString(input.provider_tool)
    || receipt.revoke_provider_payload_hash !== payloadHash(input.provider_payload)
    || !/^[a-f0-9]{64}$/.test(nonEmptyString(receipt.replacement_fingerprint_sha256) ?? "")
    || !Array.isArray(receipt.replacement_in_use_by)
    || receipt.replacement_in_use_by.length < 1
    || !credentialNames
    || !receiptNames
    || JSON.stringify(receiptNames) !== JSON.stringify(credentialNames)
  ) {
    return "replacement_readback_receipt_invalid";
  }
  return null;
}

function providerExecutionEvidenceBlocker(input: Record<string, unknown>): string | null {
  if (input.provider_response === undefined) return null;
  const receiptId = nonEmptyString(input.provider_execution_receipt_id);
  const path = nonEmptyString(input.provider_execution_receipt_path);
  const expectedSha256 = nonEmptyString(input.provider_execution_receipt_sha256);
  if (!receiptId || !path || !expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    return "provider_execution_receipt_evidence_missing";
  }
  if (!path.includes("/.tmp/workflow-receipts/provider_execution/") || !path.endsWith(`/${receiptId}.json`)) {
    return "provider_execution_receipt_evidence_invalid";
  }

  let raw: string;
  let receipt: Record<string, unknown>;
  try {
    raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return "provider_execution_receipt_evidence_invalid";
    receipt = parsed;
  } catch {
    return "provider_execution_receipt_evidence_unreadable";
  }
  if (createHash("sha256").update(raw).digest("hex") !== expectedSha256) {
    return "provider_execution_receipt_evidence_hash_mismatch";
  }

  const providerTool = nonEmptyString(input.provider_tool);
  if (
    receipt.schema !== "callscore.graph_owned_provider_execution_receipt.v1"
    || receipt.receipt_id !== receiptId
    || receipt.provider_action_name !== providerTool
    || receipt.payload_hash !== payloadHash(input.provider_payload)
    || receipt.ok !== true
    || receipt.mutation_outcome !== "succeeded"
    || !isRecord(receipt.provider_response_summary)
  ) {
    return "provider_execution_receipt_evidence_invalid";
  }
  return null;
}

export function runCredentialRotationNode(input: Record<string, unknown>): GraphOwnedMutationDecision {
  const secretGateBlocker = secretGateReceiptBlocker(input);
  if (secretGateBlocker) return blocked(secretGateBlocker);
  if (input.credential_rotation_phase === "create_and_store_replacement") {
    return blocked("credential_rotation_secret_sink_unavailable");
  }
  if (input.credential_rotation_phase !== "revoke_old") {
    return blocked("credential_rotation_phase_missing");
  }
  const revokeTool = nonEmptyString(input.provider_tool);
  if (!revokeTool || !/(?:^|_)(?:DELETE|REVOKE|DEACTIVATE|INVALIDATE|DISABLE)(?:_|$)/.test(revokeTool.toUpperCase())) {
    return blocked("credential_rotation_revoke_tool_invalid");
  }
  const replacementBlocker = replacementReadbackBlocker(input);
  if (replacementBlocker) return blocked(replacementBlocker);
  const providerEvidenceBlocker = providerExecutionEvidenceBlocker(input);
  if (providerEvidenceBlocker) return blocked(providerEvidenceBlocker);

  return runGraphOwnedMutationNode({
    input,
    nodeId: "credential_rotation_node",
    platform: "unknown",
    mutationFamily: "provider_mutation",
    mode: "bounded_write",
    requestedAction: "provider_mutation",
    missingProviderBlocker: "credential_rotation_provider_tool_missing",
    wrongNodeBlocker: "non_graph_credential_rotation_blocked",
  });
}
