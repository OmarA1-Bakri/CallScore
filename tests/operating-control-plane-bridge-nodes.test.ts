import * as assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ControlPlaneRepository,
  MemoryWorkflowIdempotencyStore,
  WorkflowRuntime,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type JsonRecord,
  type JsonValue,
  type WorkflowEventRecord,
  type WorkflowNodeRunRecord,
  type WorkflowRunRecord,
} from "../src/lib/control-plane";
import { normalizeOperatingGoalConfig } from "../src/lib/workplane/operating-goals";
import { DEFAULT_MUTATION_FLAGS, type OperatingGraphState } from "../src/lib/workplane/operating-node-utils";
import { createWorkflowRuntimeBridgeNode } from "../src/lib/workplane/node-wrappers/control-plane-bridge-nodes";

function now(): string {
  return "2026-06-25T00:00:00.000Z";
}

class BridgeRuntimeDb {
  readonly workflowRuns = new Map<string, WorkflowRunRecord>();
  readonly nodeRuns = new Map<string, WorkflowNodeRunRecord>();
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly events: WorkflowEventRecord[] = [];

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
      assert.ok(current);
      const row: WorkflowRunRecord = { ...current, status: params[1] as WorkflowRunRecord["status"], completed_at: now(), updated_at: now() };
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
      assert.ok(current);
      const row: WorkflowNodeRunRecord = { ...current, status: params[1] as WorkflowNodeRunRecord["status"], completed_at: now(), error: params[3] as string | null, updated_at: now() };
      this.nodeRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set output_artifact_id")) {
      const current = this.nodeRuns.get(String(params[0]));
      assert.ok(current);
      const row: WorkflowNodeRunRecord = { ...current, output_artifact_id: String(params[1]), updated_at: now() };
      this.nodeRuns.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into workflow_events")) {
      const row: WorkflowEventRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, event_type: params[3] as WorkflowEventRecord["event_type"], detail: params[4] as JsonRecord, created_at: now() };
      this.events.push(row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into artifacts")) {
      const row: ArtifactRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, artifact_type: String(params[3]), schema_version: String(params[4]), entity_type: params[5] as string | null, entity_id: params[6] as string | null, storage_uri: params[7] as string | null, json: params[8] as JsonValue | null, sha256: String(params[9]), created_at: now() };
      this.artifacts.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into artifact_links")) return [] as T[];
    throw new Error(`Unhandled SQL in bridge fake: ${normalized}`);
  };
}

function runtimeFixture() {
  const db = new BridgeRuntimeDb();
  const repository = new ControlPlaneRepository(db.execute);
  const runtime = new WorkflowRuntime(repository, { idempotencyStore: new MemoryWorkflowIdempotencyStore() });
  return { db, runtime };
}

function emptyState(): OperatingGraphState {
  return {
    config: normalizeOperatingGoalConfig({ goal: "evidence_research", testFixtures: true }),
    node_results: [],
    blockers: [],
    warnings: [],
    errors: [],
    mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
    receipts: [],
    artifacts: {},
  };
}

test("WorkflowRuntime bridge executes fixture workflow and preserves output artifact ids", async () => {
  const { runtime } = runtimeFixture();
  const artifactDir = mkdtempSync(join(tmpdir(), "operating-bridge-test-"));
  const node = createWorkflowRuntimeBridgeNode({
    artifactDir,
    runtime,
    definition: {
      name: "bridge_fixture",
      version: "v1",
      entityType: "creator",
      nodes: [{ id: "produce_evidence", type: "deterministic", run: async () => ({ outputArtifact: { artifactType: "bridge_fixture", schemaVersion: "v1", json: { ok: true } } }) }],
    },
    input: { entityId: "creator-1", triggeredBy: "test" },
  });

  const patch = await node(emptyState(), { configurable: { thread_id: "bridge-success" } });
  const result = patch.node_results?.[0];
  assert.equal(result?.status, "ok");
  assert.equal(result?.detail.workflow_status, "completed");
  assert.equal((result?.detail.output_artifact_ids as unknown[])?.length, 1);
  assert.ok(result?.artifact_path);
  assert.equal(existsSync(result!.artifact_path!), true);
});

test("WorkflowRuntime bridge maps awaiting approval to blocked node result", async () => {
  const { runtime } = runtimeFixture();
  const node = createWorkflowRuntimeBridgeNode({
    artifactDir: mkdtempSync(join(tmpdir(), "operating-bridge-approval-test-")),
    runtime,
    definition: {
      name: "approval_fixture",
      version: "v1",
      entityType: "creator",
      nodes: [{ id: "publish_gate", type: "approval_gate", run: async () => ({ status: "awaiting_approval", reason: "publish approval required" }) }],
    },
    input: { entityId: "creator-2", triggeredBy: "test" },
  });

  const patch = await node(emptyState(), { configurable: { thread_id: "bridge-approval" } });
  const result = patch.node_results?.[0];
  assert.equal(result?.status, "blocked");
  assert.equal(result?.blockers.includes("awaiting_approval"), true);
  assert.equal(result?.summary.includes("awaiting_approval"), true);
});

test("WorkflowRuntime bridge maps runtime errors to failed result without synthetic success", async () => {
  const { runtime } = runtimeFixture();
  const node = createWorkflowRuntimeBridgeNode({
    artifactDir: mkdtempSync(join(tmpdir(), "operating-bridge-failure-test-")),
    runtime,
    definition: {
      name: "failure_fixture",
      version: "v1",
      entityType: "creator",
      nodes: [{ id: "always_fails", type: "deterministic", maxAttempts: 1, run: async () => { throw new Error("bridge fixture failure"); } }],
    },
    input: { entityId: "creator-3", triggeredBy: "test" },
  });

  const patch = await node(emptyState(), { configurable: { thread_id: "bridge-failure" } });
  const result = patch.node_results?.[0];
  assert.equal(result?.status, "failed");
  assert.equal(result?.summary.includes("failed"), true);
  assert.equal(result?.blockers.some((blocker) => blocker.includes("bridge fixture failure")), true);
});
