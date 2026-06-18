import test from "node:test";
import assert from "node:assert/strict";
import {
  ControlPlaneRepository,
  MemoryWorkflowIdempotencyStore,
  WorkflowRuntime,
  type ApprovalGateRecord,
  type ArtifactLinkRecord,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type JsonRecord,
  type JsonValue,
  type WorkflowEventRecord,
  type WorkflowNodeRunRecord,
  type WorkflowRunRecord,
} from "../src/lib/control-plane";

function now(): string {
  return "2026-06-18T00:00:00.000Z";
}

class RuntimeDb {
  readonly workflowRuns = new Map<string, WorkflowRunRecord>();
  readonly nodeRuns = new Map<string, WorkflowNodeRunRecord>();
  readonly events: WorkflowEventRecord[] = [];
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly links: ArtifactLinkRecord[] = [];
  readonly gates = new Map<string, ApprovalGateRecord>();

  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

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
      assert.ok(current, "node run must exist before output attach");
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
        json: params[8] as JsonValue | null,
        sha256: String(params[9]),
        created_at: now(),
      };
      this.artifacts.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into artifact_links")) {
      const row: ArtifactLinkRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        child_artifact_id: String(params[2]),
        parent_artifact_id: String(params[3]),
        link_type: params[4] as ArtifactLinkRecord["link_type"],
        metadata: params[5] as JsonRecord,
        created_at: now(),
      };
      this.links.push(row);
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

    throw new Error(`Unhandled SQL in runtime fake: ${normalized}`);
  };
}

function makeRuntime(db = new RuntimeDb()) {
  const repository = new ControlPlaneRepository(db.execute);
  return { db, repository, runtime: new WorkflowRuntime(repository, { idempotencyStore: new MemoryWorkflowIdempotencyStore() }) };
}

test("workflow runtime executes dependent nodes in order and passes artifacts between nodes", async () => {
  const { db, runtime } = makeRuntime();
  const order: string[] = [];

  const result = await runtime.run({
    name: "phase4_fixture",
    version: "v1",
    entityType: "video",
    nodes: [
      {
        id: "fetch_video_metadata",
        type: "deterministic",
        run: async (ctx) => {
          order.push(ctx.node.id);
          return {
            outputArtifact: {
              artifactType: "video_metadata",
              schemaVersion: "callscore.video_metadata.v1",
              json: { video_id: ctx.entityId },
            },
          };
        },
      },
      {
        id: "segment_transcript",
        type: "deterministic",
        dependsOn: ["fetch_video_metadata"],
        run: async (ctx) => {
          order.push(ctx.node.id);
          assert.equal(ctx.inputArtifactIds.length, 1);
          return {
            outputArtifact: {
              artifactType: "transcript_segments",
              schemaVersion: "callscore.transcript_segments.v1",
              json: { parent_artifact_id: ctx.inputArtifactIds[0], segments: [{ id: "seg-1" }] },
            },
          };
        },
      },
    ],
  }, { entityId: "video-1", triggeredBy: "test" });

  assert.equal(result.status, "completed");
  assert.deepEqual(order, ["fetch_video_metadata", "segment_transcript"]);
  assert.equal(db.artifacts.size, 2);
  assert.equal(db.links.length, 1);
  assert.deepEqual([...db.nodeRuns.values()].map((node) => node.status), ["completed", "completed"]);
  assert.ok(db.events.some((event) => event.event_type === "workflow.completed"));
});

test("workflow runtime records failed node attempts and retries within maxAttempts", async () => {
  const { db, runtime } = makeRuntime();
  let attempts = 0;

  const result = await runtime.run({
    name: "retry_fixture",
    version: "v1",
    entityType: "video",
    nodes: [{
      id: "flaky_worker",
      type: "llm_structured",
      maxAttempts: 2,
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary model failure");
        return { outputArtifact: { artifactType: "candidate_calls", schemaVersion: "v1", json: { calls: [] } } };
      },
    }],
  }, { entityId: "video-2" });

  const flakyRuns = [...db.nodeRuns.values()].filter((node) => node.node_id === "flaky_worker");
  assert.equal(result.status, "completed");
  assert.equal(attempts, 2);
  assert.deepEqual(flakyRuns.map((node) => node.status), ["failed", "completed"]);
  assert.ok(db.events.some((event) => event.event_type === "node.failed"));
});

test("workflow runtime records terminal failure after retry cap", async () => {
  const { db, runtime } = makeRuntime();

  const result = await runtime.run({
    name: "failure_fixture",
    version: "v1",
    entityType: "video",
    nodes: [{
      id: "always_fails",
      type: "deterministic",
      maxAttempts: 1,
      run: async () => { throw new Error("bad input"); },
    }],
  }, { entityId: "video-3" });

  assert.equal(result.status, "failed");
  assert.equal([...db.nodeRuns.values()][0].status, "failed");
  assert.equal([...db.workflowRuns.values()][0].status, "failed");
  assert.ok(db.events.some((event) => event.event_type === "workflow.failed"));
});

test("approval node pauses workflow and prevents downstream execution", async () => {
  const { db, runtime } = makeRuntime();
  const order: string[] = [];

  const result = await runtime.run({
    name: "approval_fixture",
    version: "v1",
    entityType: "market_call",
    nodes: [
      {
        id: "normalize_calls",
        type: "deterministic",
        run: async (ctx) => {
          order.push(ctx.node.id);
          return { outputArtifact: { artifactType: "normalized_calls", schemaVersion: "v1", json: { calls: [] } } };
        },
      },
      {
        id: "human_gate",
        type: "approval",
        dependsOn: ["normalize_calls"],
        run: async (ctx) => {
          order.push(ctx.node.id);
          await ctx.repository.requestApprovalGate({
            workflowRunId: ctx.workflowRun.id,
            nodeRunId: ctx.nodeRun.id,
            gateType: "low_confidence_market_call",
            reason: "low_confidence",
          });
          return { status: "awaiting_approval", reason: "human_review_required" };
        },
      },
      {
        id: "publish",
        type: "deterministic",
        dependsOn: ["human_gate"],
        run: async (ctx) => {
          order.push(ctx.node.id);
          return {};
        },
      },
    ],
  }, { entityId: "call-1" });

  assert.equal(result.status, "awaiting_approval");
  assert.deepEqual(order, ["normalize_calls", "human_gate"]);
  assert.equal(db.gates.size, 1);
  assert.equal([...db.workflowRuns.values()][0].status, "awaiting_approval");
  assert.ok(db.events.some((event) => event.event_type === "approval.requested"));
});

test("cancelled workflow does not continue to later nodes", async () => {
  const { db, runtime } = makeRuntime();
  const order: string[] = [];

  const result = await runtime.run({
    name: "cancel_fixture",
    version: "v1",
    entityType: "video",
    nodes: [
      { id: "first", type: "deterministic", run: async (ctx) => { order.push(ctx.node.id); return {}; } },
      { id: "cancel_now", type: "cancel", dependsOn: ["first"], run: async (ctx) => { order.push(ctx.node.id); return { status: "cancelled", reason: "operator_cancelled" }; } },
      { id: "never", type: "deterministic", dependsOn: ["cancel_now"], run: async (ctx) => { order.push(ctx.node.id); return {}; } },
    ],
  }, { entityId: "video-4" });

  assert.equal(result.status, "cancelled");
  assert.deepEqual(order, ["first", "cancel_now"]);
  assert.equal([...db.workflowRuns.values()][0].status, "cancelled");
});

test("idempotency guard returns the existing workflow run without re-executing nodes", async () => {
  const { db, runtime } = makeRuntime();
  let executions = 0;
  const definition = {
    name: "idempotent_fixture",
    version: "v1",
    entityType: "video",
    nodes: [{ id: "only", type: "deterministic" as const, run: async () => { executions += 1; return {}; } }],
  };

  const first = await runtime.run(definition, { entityId: "video-5", idempotencyKey: "video-5:v1" });
  const second = await runtime.run(definition, { entityId: "video-5", idempotencyKey: "video-5:v1" });

  assert.equal(first.status, "completed");
  assert.equal(second.status, "completed");
  assert.equal(second.reusedExistingRun, true);
  assert.equal(first.workflowRun.id, second.workflowRun.id);
  assert.equal(executions, 1);
  assert.equal(db.nodeRuns.size, 1);
});

test("workflow runtime rejects cycles before writing workflow state", async () => {
  const { db, runtime } = makeRuntime();

  await assert.rejects(
    runtime.run({
      name: "cycle_fixture",
      version: "v1",
      entityType: "video",
      nodes: [
        { id: "a", type: "deterministic", dependsOn: ["b"], run: async () => ({}) },
        { id: "b", type: "deterministic", dependsOn: ["a"], run: async () => ({}) },
      ],
    }, { entityId: "video-6" }),
    /workflow_definition_has_cycle_or_missing_dependency/,
  );
  assert.equal(db.workflowRuns.size, 0);
});
