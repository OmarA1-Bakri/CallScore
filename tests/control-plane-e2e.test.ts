import test from "node:test";
import assert from "node:assert/strict";
import {
  ControlPlaneRepository,
  type AgentInvocationRecord,
  type ApprovalGateRecord,
  type ArtifactLineageRecord,
  type ArtifactLinkRecord,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type JsonRecord,
  type JsonValue,
  type WorkflowEventRecord,
  type WorkflowNodeRunRecord,
  type WorkflowRunRecord,
} from "../src/lib/control-plane";
import { createScoreBoundaryArtifacts } from "../src/lib/scoring-boundary";
import { runVideoIntelligenceWorkflow } from "../src/lib/workflows/video-intelligence";

function now(): string { return "2026-06-18T00:00:00.000Z"; }

class E2eDb {
  readonly workflowRuns = new Map<string, WorkflowRunRecord>();
  readonly nodeRuns = new Map<string, WorkflowNodeRunRecord>();
  readonly events: WorkflowEventRecord[] = [];
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly links: ArtifactLinkRecord[] = [];
  readonly gates = new Map<string, ApprovalGateRecord>();
  readonly invocations = new Map<string, AgentInvocationRecord>();

  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("insert into workflow_runs")) { const row: WorkflowRunRecord = { id: String(params[0]), workflow_name: String(params[1]), entity_type: String(params[2]), entity_id: String(params[3]), status: params[4] as WorkflowRunRecord["status"], started_at: params[5] as string | null, completed_at: params[6] as string | null, triggered_by: params[7] as string | null, total_input_tokens: params[8] as number | null, total_output_tokens: params[9] as number | null, total_cost_usd: params[10] as number | null, pipeline_run_id: params[11] as number | null, metadata: params[12] as JsonRecord, created_at: now(), updated_at: now() }; this.workflowRuns.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("update workflow_runs")) { const current = this.workflowRuns.get(String(params[0])); assert.ok(current); const row = { ...current, status: params[1] as WorkflowRunRecord["status"], completed_at: (params[2] as string | null) ?? current.completed_at, updated_at: now() }; this.workflowRuns.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("insert into workflow_node_runs")) { const row: WorkflowNodeRunRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_id: String(params[2]), node_type: params[3] as WorkflowNodeRunRecord["node_type"], role: params[4] as string | null, status: params[5] as WorkflowNodeRunRecord["status"], parent_node_run_id: params[6] as string | null, model: params[7] as string | null, prompt_version: params[8] as string | null, input_artifact_ids: params[9] as readonly string[], output_artifact_id: params[10] as string | null, started_at: params[11] as string | null, completed_at: params[12] as string | null, error: params[13] as string | null, pipeline_job_id: params[14] as number | null, metadata: params[15] as JsonRecord, created_at: now(), updated_at: now() }; this.nodeRuns.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set status")) { const current = this.nodeRuns.get(String(params[0])); assert.ok(current); const row = { ...current, status: params[1] as WorkflowNodeRunRecord["status"], completed_at: (params[2] as string | null) ?? current.completed_at, error: (params[3] as string | null) ?? current.error, updated_at: now() }; this.nodeRuns.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set output_artifact_id")) { const current = this.nodeRuns.get(String(params[0])); assert.ok(current); const row = { ...current, output_artifact_id: String(params[1]), updated_at: now() }; this.nodeRuns.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("insert into workflow_events")) { const row: WorkflowEventRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, event_type: params[3] as WorkflowEventRecord["event_type"], detail: params[4] as JsonRecord, created_at: now() }; this.events.push(row); return [row] as T[]; }
    if (normalized.startsWith("insert into artifacts")) { const row: ArtifactRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, artifact_type: String(params[3]), schema_version: String(params[4]), entity_type: params[5] as string | null, entity_id: params[6] as string | null, storage_uri: params[7] as string | null, json: params[8] as JsonValue | null, sha256: String(params[9]), created_at: now() }; this.artifacts.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("insert into artifact_links")) { const row: ArtifactLinkRecord = { id: String(params[0]), workflow_run_id: String(params[1]), child_artifact_id: String(params[2]), parent_artifact_id: String(params[3]), link_type: params[4] as ArtifactLinkRecord["link_type"], metadata: params[5] as JsonRecord, created_at: now() }; this.links.push(row); return [row] as T[]; }
    if (normalized.startsWith("insert into agent_invocations")) { const row: AgentInvocationRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: String(params[2]), role: String(params[3]), provider: params[4] as string | null, model: params[5] as string | null, prompt_version: params[6] as string | null, input_artifact_ids: params[7] as readonly string[], output_artifact_id: params[8] as string | null, input_tokens: params[9] as number | null, output_tokens: params[10] as number | null, cost_usd: params[11] as number | null, latency_ms: params[12] as number | null, status: params[13] as AgentInvocationRecord["status"], error: params[14] as string | null, created_at: now() }; this.invocations.set(row.id, row); return [row] as T[]; }
    if (normalized.startsWith("insert into approval_gates")) { const row: ApprovalGateRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, gate_type: String(params[3]), status: params[4] as ApprovalGateRecord["status"], reason: params[5] as string | null, approved_by: params[6] as string | null, approved_at: params[7] as string | null, rejected_by: params[8] as string | null, rejected_at: params[9] as string | null, metadata: params[10] as JsonRecord, created_at: now() }; this.gates.set(row.id, row); return [row] as T[]; }
    if (normalized.includes("recursive artifact_lineage")) {
      const rows: ArtifactLineageRecord[] = [];
      const visit = (artifactId: string, depth: number, path: string[]) => {
        const artifact = this.artifacts.get(artifactId); if (!artifact) return;
        rows.push({ ...artifact, depth, path });
        for (const link of this.links.filter((candidate) => candidate.child_artifact_id === artifactId)) if (!path.includes(link.parent_artifact_id)) visit(link.parent_artifact_id, depth + 1, [...path, link.parent_artifact_id]);
      };
      visit(String(params[0]), 0, [String(params[0])]);
      return rows.sort((a, b) => a.depth - b.depth || a.created_at.localeCompare(b.created_at)) as T[];
    }
    throw new Error(`Unhandled SQL in e2e fake: ${normalized}`);
  };
}

test("fixture transcript runs video intelligence, deterministic scoring, and lineage back to video metadata", async () => {
  const db = new E2eDb();
  const repository = new ControlPlaneRepository(db.execute);
  const workflow = await runVideoIntelligenceWorkflow({
    videoId: "fixture-video-e2e",
    title: "BTC trade plan",
    creatorHandle: "creator",
    transcript: "I am buying BTC around 100000, target 125000 over 30 days, invalidated below 95000.",
  }, { repository, triggeredBy: "e2e" });
  assert.equal(workflow.status, "completed");
  const normalizedArtifact = [...db.artifacts.values()].find((artifact) => artifact.artifact_type === "normalized_calls");
  assert.ok(normalizedArtifact);

  const scored = await createScoreBoundaryArtifacts({
    repository,
    workflowRunId: workflow.workflowRun.id,
    nodeRunId: [...db.nodeRuns.values()].find((node) => node.node_id === "validate_evidence")?.id ?? null,
    normalizedCallArtifactId: normalizedArtifact.id,
    callId: "fixture-call-1",
    marketSymbol: "BTCUSDT",
    direction: "bullish",
    confidence: 0.9,
    callTimestamp: "2026-01-01T00:00:00.000Z",
    horizonTimestamp: "2026-01-31T00:00:00.000Z",
    candles: [
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-01T00:00:00.000Z", priceUsd: 100000, provider: "fixture" },
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-31T00:00:00.000Z", priceUsd: 125000, provider: "fixture" },
    ],
  });

  assert.equal(scored.evaluation.correctDirection, true);
  assert.equal(scored.evaluation.score, 22.5);
  const lineage = await repository.listArtifactLineage(scored.scoreEvaluationArtifact.id);
  assert.deepEqual(lineage.map((artifact) => artifact.artifact_type), [
    "score_evaluation",
    "price_resolution",
    "normalized_calls",
    "candidate_calls",
    "transcript_segments",
    "transcript_raw",
    "video_metadata",
  ]);
  assert.equal(db.gates.size, 0);
  assert.ok(db.events.some((event) => event.event_type === "workflow.completed"));
});
