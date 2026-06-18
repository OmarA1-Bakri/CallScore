import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ControlPlaneRepository,
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_STATUSES,
  checksumArtifact,
  mapPipelineStatusToWorkflowStatus,
  stableJsonStringify,
  type AgentInvocationRecord,
  type ApprovalGateRecord,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type JsonRecord,
  type WorkflowEventRecord,
  type WorkflowNodeRunRecord,
  type WorkflowRunRecord,
} from "../src/lib/control-plane";

const root = join(__dirname, "..");

function now(): string {
  return "2026-06-18T00:00:00.000Z";
}

class MemoryControlPlaneDb {
  readonly workflowRuns = new Map<string, WorkflowRunRecord>();
  readonly nodeRuns = new Map<string, WorkflowNodeRunRecord>();
  readonly events: WorkflowEventRecord[] = [];
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly invocations = new Map<string, AgentInvocationRecord>();
  readonly gates = new Map<string, ApprovalGateRecord>();
  readonly statements: string[] = [];

  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    this.statements.push(normalized);

    if (normalized.startsWith("insert into workflow_runs")) {
      const row: WorkflowRunRecord = {
        id: String(params[0]),
        workflow_name: String(params[1]),
        entity_type: String(params[2]),
        entity_id: String(params[3]),
        status: params[4] as WorkflowRunRecord["status"],
        started_at: params[5] as string | null,
        completed_at: params[6] as string | null,
        triggered_by: params[7] as string | null,
        total_input_tokens: params[8] as number | null,
        total_output_tokens: params[9] as number | null,
        total_cost_usd: params[10] as number | null,
        pipeline_run_id: params[11] as number | null,
        metadata: params[12] as JsonRecord,
        created_at: now(),
        updated_at: now(),
      };
      this.workflowRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("update workflow_runs")) {
      const current = this.workflowRuns.get(String(params[0]));
      assert.ok(current, "workflow run must exist before update");
      const row: WorkflowRunRecord = {
        ...current,
        status: params[1] as WorkflowRunRecord["status"],
        completed_at: (params[2] as string | null) ?? current.completed_at,
        updated_at: now(),
      };
      this.workflowRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into workflow_node_runs")) {
      const row: WorkflowNodeRunRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_id: String(params[2]),
        node_type: params[3] as WorkflowNodeRunRecord["node_type"],
        role: params[4] as string | null,
        status: params[5] as WorkflowNodeRunRecord["status"],
        parent_node_run_id: params[6] as string | null,
        model: params[7] as string | null,
        prompt_version: params[8] as string | null,
        input_artifact_ids: params[9] as readonly string[],
        output_artifact_id: params[10] as string | null,
        started_at: params[11] as string | null,
        completed_at: params[12] as string | null,
        error: params[13] as string | null,
        pipeline_job_id: params[14] as number | null,
        metadata: params[15] as JsonRecord,
        created_at: now(),
        updated_at: now(),
      };
      this.nodeRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set status")) {
      const current = this.nodeRuns.get(String(params[0]));
      assert.ok(current, "node run must exist before update");
      const row: WorkflowNodeRunRecord = {
        ...current,
        status: params[1] as WorkflowNodeRunRecord["status"],
        completed_at: (params[2] as string | null) ?? current.completed_at,
        error: (params[3] as string | null) ?? current.error,
        updated_at: now(),
      };
      this.nodeRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set output_artifact_id")) {
      const current = this.nodeRuns.get(String(params[0]));
      assert.ok(current, "node run must exist before artifact attach");
      const row: WorkflowNodeRunRecord = { ...current, output_artifact_id: String(params[1]), updated_at: now() };
      this.nodeRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into workflow_events")) {
      const row: WorkflowEventRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_run_id: params[2] as string | null,
        event_type: params[3] as WorkflowEventRecord["event_type"],
        detail: params[4] as JsonRecord,
        created_at: now(),
      };
      this.events.push(row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into artifacts")) {
      const row: ArtifactRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_run_id: params[2] as string | null,
        artifact_type: String(params[3]),
        schema_version: String(params[4]),
        entity_type: params[5] as string | null,
        entity_id: params[6] as string | null,
        storage_uri: params[7] as string | null,
        json: params[8] as ArtifactRecord["json"],
        sha256: String(params[9]),
        created_at: now(),
      };
      this.artifacts.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into agent_invocations")) {
      const row: AgentInvocationRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_run_id: String(params[2]),
        role: String(params[3]),
        provider: params[4] as string | null,
        model: params[5] as string | null,
        prompt_version: params[6] as string | null,
        input_artifact_ids: params[7] as readonly string[],
        output_artifact_id: params[8] as string | null,
        input_tokens: params[9] as number | null,
        output_tokens: params[10] as number | null,
        cost_usd: params[11] as number | null,
        latency_ms: params[12] as number | null,
        status: params[13] as AgentInvocationRecord["status"],
        error: params[14] as string | null,
        created_at: now(),
      };
      this.invocations.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into approval_gates")) {
      const row: ApprovalGateRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_run_id: params[2] as string | null,
        gate_type: String(params[3]),
        status: params[4] as ApprovalGateRecord["status"],
        reason: params[5] as string | null,
        approved_by: params[6] as string | null,
        approved_at: params[7] as string | null,
        rejected_by: params[8] as string | null,
        rejected_at: params[9] as string | null,
        metadata: params[10] as JsonRecord,
        created_at: now(),
      };
      this.gates.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("update approval_gates")) {
      const current = this.gates.get(String(params[0]));
      assert.ok(current, "approval gate must exist before update");
      const approved = params[2] === true;
      const row: ApprovalGateRecord = {
        ...current,
        status: params[1] as ApprovalGateRecord["status"],
        approved_by: approved ? String(params[3]) : current.approved_by,
        approved_at: approved ? now() : current.approved_at,
        rejected_by: approved ? current.rejected_by : String(params[3]),
        rejected_at: approved ? current.rejected_at : now(),
      };
      this.gates.set(row.id, row);
      return [row] as T[];
    }

    throw new Error(`Unhandled SQL in test fake: ${normalized}`);
  };
}

test("control-plane constants encode required statuses, node types, and event types", () => {
  assert.deepEqual(WORKFLOW_STATUSES, [
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",
    "awaiting_approval",
    "cancelled",
    "blocked",
  ]);
  assert.ok(WORKFLOW_NODE_TYPES.includes("llm_structured"));
  assert.ok(WORKFLOW_NODE_TYPES.includes("approval"));
  assert.ok(WORKFLOW_EVENT_TYPES.includes("artifact.created"));
  assert.ok(WORKFLOW_EVENT_TYPES.includes("approval.rejected"));
  assert.equal(mapPipelineStatusToWorkflowStatus("succeeded"), "completed");
  assert.equal(mapPipelineStatusToWorkflowStatus("queued"), "pending");
});

test("artifact checksum is deterministic over canonical JSON independent of key order", () => {
  const left = checksumArtifact({
    artifactType: "candidate_calls",
    schemaVersion: "v1",
    entityType: "video",
    entityId: "42",
    json: { z: 1, a: { b: true, a: ["x", "y"] } },
  });
  const right = checksumArtifact({
    artifactType: "candidate_calls",
    schemaVersion: "v1",
    entityType: "video",
    entityId: "42",
    json: { a: { a: ["x", "y"], b: true }, z: 1 },
  });

  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/);
  assert.equal(stableJsonStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("repository creates workflow, node, artifact, invocation, approval gate, and lifecycle events", async () => {
  const db = new MemoryControlPlaneDb();
  const repo = new ControlPlaneRepository(db.execute);

  const run = await repo.startWorkflowRun({
    id: "00000000-0000-4000-8000-000000000001",
    workflowName: "video_intelligence_workflow",
    entityType: "video",
    entityId: "video-1",
    triggeredBy: "test",
    pipelineRunId: 77,
    metadata: { source: "fixture" },
  });
  assert.equal(run.status, "running");
  assert.equal(run.pipeline_run_id, 77);

  const node = await repo.startNodeRun({
    id: "00000000-0000-4000-8000-000000000002",
    workflowRunId: run.id,
    nodeId: "extract_candidate_calls",
    nodeType: "llm_structured",
    role: "extractor",
    model: "fixture-model",
    promptVersion: "candidate-calls.v1",
    pipelineJobId: 88,
  });
  assert.equal(node.status, "running");
  assert.equal(node.pipeline_job_id, 88);

  const artifact = await repo.createArtifact({
    id: "00000000-0000-4000-8000-000000000003",
    workflowRunId: run.id,
    nodeRunId: node.id,
    artifactType: "candidate_calls",
    schemaVersion: "callscore.candidate_calls.v1",
    entityType: "video",
    entityId: "video-1",
    json: { calls: [{ asset_symbol: "BTC", direction: "bullish", confidence: 0.91 }] },
  });
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);

  const attached = await repo.attachNodeOutputArtifact(node.id, artifact.id);
  assert.equal(attached.output_artifact_id, artifact.id);

  const invocation = await repo.recordAgentInvocation({
    id: "00000000-0000-4000-8000-000000000004",
    workflowRunId: run.id,
    nodeRunId: node.id,
    role: "extractor",
    provider: "fixture",
    model: "fixture-model",
    promptVersion: "candidate-calls.v1",
    inputArtifactIds: [],
    outputArtifactId: artifact.id,
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0.001,
    latencyMs: 25,
    status: "completed",
  });
  assert.equal(invocation.status, "completed");
  assert.equal(invocation.output_artifact_id, artifact.id);

  const gate = await repo.requestApprovalGate({
    id: "00000000-0000-4000-8000-000000000005",
    workflowRunId: run.id,
    nodeRunId: node.id,
    gateType: "low_confidence_call_review",
    reason: "confidence < 0.80",
    metadata: { threshold: 0.8 },
  });
  assert.equal(gate.status, "awaiting_approval");

  const rejected = await repo.resolveApprovalGate(gate.id, "rejected", "reviewer", { reason: "fixture rejection" });
  assert.equal(rejected.status, "blocked");
  assert.equal(rejected.rejected_by, "reviewer");

  const completedNode = await repo.updateNodeRunStatus(node.id, "completed", { output_artifact_id: artifact.id });
  assert.equal(completedNode.status, "completed");

  const completedRun = await repo.updateWorkflowRunStatus(run.id, "completed", { node_count: 1 });
  assert.equal(completedRun.status, "completed");

  assert.deepEqual(db.events.map((event) => event.event_type), [
    "workflow.started",
    "node.started",
    "artifact.created",
    "agent_invocation.completed",
    "approval.requested",
    "approval.rejected",
    "node.completed",
    "workflow.completed",
  ]);
  assert.equal(db.workflowRuns.size, 1);
  assert.equal(db.nodeRuns.size, 1);
  assert.equal(db.artifacts.size, 1);
  assert.equal(db.invocations.size, 1);
  assert.equal(db.gates.size, 1);
});

test("repository rejects artifacts without JSON or storage URI", async () => {
  const db = new MemoryControlPlaneDb();
  const repo = new ControlPlaneRepository(db.execute);

  await assert.rejects(
    () => repo.createArtifact({
      workflowRunId: "00000000-0000-4000-8000-000000000001",
      artifactType: "empty",
      schemaVersion: "v1",
    }),
    /artifact_requires_json_or_storage_uri/,
  );
});

test("workflow control-plane migration creates required tables, checks, bridges, and indexes", () => {
  const migration = readFileSync(join(root, "migrations/022-workflow-control-plane.sql"), "utf8");
  for (const table of [
    "workflow_runs",
    "workflow_node_runs",
    "workflow_events",
    "artifacts",
    "agent_invocations",
    "approval_gates",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  for (const status of WORKFLOW_STATUSES) assert.match(migration, new RegExp(`'${status}'`, "i"));
  for (const eventType of WORKFLOW_EVENT_TYPES) assert.match(migration, new RegExp(`'${eventType.replace(".", "\\.")}'`, "i"));
  assert.match(migration, /pipeline_run_id BIGINT REFERENCES pipeline_runs\(id\)/i);
  assert.match(migration, /pipeline_job_id BIGINT REFERENCES pipeline_jobs\(id\)/i);
  assert.match(migration, /sha256 ~ '\^\[a-f0-9\]\{64\}\$'/i);
  assert.match(migration, /COMMENT ON TABLE artifacts IS 'Immutable control-plane artifacts/i);
});
