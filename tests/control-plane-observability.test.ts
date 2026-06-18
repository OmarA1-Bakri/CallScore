import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildControlPlaneOverview,
  buildWorkflowRunDetail,
  ControlPlaneRepository,
  redactArtifactForObservation,
  type ApprovalGateRecord,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type WorkflowEventRecord,
  type WorkflowNodeRunRecord,
  type WorkflowRunRecord,
} from "../src/lib/control-plane";

const root = join(__dirname, "..");
const now = "2026-06-18T00:00:00.000Z";

class ObservabilityDb {
  readonly run: WorkflowRunRecord = { id: "run-1", workflow_name: "video_intelligence_workflow", entity_type: "video", entity_id: "video-1", status: "awaiting_approval", started_at: now, completed_at: null, triggered_by: "test", total_input_tokens: 10, total_output_tokens: 20, total_cost_usd: 0.03, pipeline_run_id: null, metadata: {}, created_at: now, updated_at: now };
  readonly node: WorkflowNodeRunRecord = { id: "node-1", workflow_run_id: "run-1", node_id: "approval_gate_if_required", node_type: "approval", role: null, status: "awaiting_approval", parent_node_run_id: null, model: null, prompt_version: null, input_artifact_ids: [], output_artifact_id: null, started_at: now, completed_at: null, error: null, pipeline_job_id: null, metadata: {}, created_at: now, updated_at: now };
  readonly artifact: ArtifactRecord = { id: "artifact-1", workflow_run_id: "run-1", node_run_id: "node-1", artifact_type: "validation_report", schema_version: "v1", entity_type: "market_call", entity_id: "call-1", storage_uri: null, json: { ok: true, token: "secret-ish", nested: { api_key: "secret-ish" } }, sha256: "a".repeat(64), created_at: now };
  readonly gate: ApprovalGateRecord = { id: "gate-1", workflow_run_id: "run-1", node_run_id: "node-1", gate_type: "video_intelligence_review", status: "awaiting_approval", reason: "low_confidence", approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, metadata: {}, created_at: now };
  readonly event: WorkflowEventRecord = { id: "event-1", workflow_run_id: "run-1", node_run_id: "node-1", event_type: "approval.requested", detail: {}, created_at: now };

  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from workflow_runs") && normalized.includes("where id")) return (params[0] === "run-1" ? [this.run] : []) as T[];
    if (normalized.includes("from workflow_runs")) return [this.run] as T[];
    if (normalized.includes("from workflow_node_runs") && normalized.includes("where workflow_run_id")) return [this.node] as T[];
    if (normalized.includes("from workflow_events")) return [this.event] as T[];
    if (normalized.includes("from artifacts") && normalized.includes("where workflow_run_id")) return [this.artifact] as T[];
    if (normalized.includes("from artifacts") && normalized.includes("where entity_type")) return [this.artifact] as T[];
    if (normalized.includes("from approval_gates") && normalized.includes("where workflow_run_id")) return [this.gate] as T[];
    if (normalized.includes("union all")) return [{ kind: "approval_gate", id: this.gate.id, workflow_run_id: this.gate.workflow_run_id, status: this.gate.status, reason: this.gate.reason, created_at: this.gate.created_at }] as T[];
    throw new Error(`Unhandled SQL in observability fake: ${normalized}`);
  };
}

test("observability detail combines run, nodes, artifacts, events, gates, and redacts secret-shaped artifact keys", async () => {
  const repository = new ControlPlaneRepository(new ObservabilityDb().execute);
  const detail = await buildWorkflowRunDetail(repository, "run-1");
  assert.ok(detail);
  assert.equal(detail.totals.nodes, 1);
  assert.equal(detail.totals.artifacts, 1);
  assert.equal(detail.totals.approvalGates, 1);
  assert.equal(detail.totals.totalInputTokens, 10);
  assert.equal((detail.artifacts[0].json as { token: string }).token, "[REDACTED]");
});

test("observability overview returns blocked items without mutation", async () => {
  const repository = new ControlPlaneRepository(new ObservabilityDb().execute);
  const overview = await buildControlPlaneOverview(repository);
  assert.equal(overview.runs.length, 1);
  assert.equal(overview.blockedItems[0]?.kind, "approval_gate");
});

test("redactArtifactForObservation recursively redacts credential-shaped keys", () => {
  const db = new ObservabilityDb();
  const redacted = redactArtifactForObservation(db.artifact);
  assert.equal((redacted.json as { token: string }).token, "[REDACTED]");
  assert.equal(((redacted.json as { nested: { api_key: string } }).nested.api_key), "[REDACTED]");
});

test("workflow observability API routes are read-only GET surfaces", () => {
  const files = [
    "src/app/api/workflows/route.ts",
    "src/app/api/workflows/[id]/route.ts",
    "src/app/api/calls/[id]/lineage/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
    assert.doesNotMatch(source, /requestApprovalGate|resolveApprovalGate|createArtifact|createWorkflowRun/);
  }
});
