import test from "node:test";
import assert from "node:assert/strict";
import {
  ControlPlaneRepository,
  type AgentInvocationRecord,
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
import { runVideoIntelligenceWorkflow } from "../src/lib/workflows/video-intelligence";

function now(): string { return "2026-06-18T00:00:00.000Z"; }

class WorkflowDb {
  readonly workflowRuns = new Map<string, WorkflowRunRecord>();
  readonly nodeRuns = new Map<string, WorkflowNodeRunRecord>();
  readonly events: WorkflowEventRecord[] = [];
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly links: ArtifactLinkRecord[] = [];
  readonly gates = new Map<string, ApprovalGateRecord>();
  readonly invocations = new Map<string, AgentInvocationRecord>();

  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("insert into workflow_runs")) {
      const row: WorkflowRunRecord = { id: String(params[0]), workflow_name: String(params[1]), entity_type: String(params[2]), entity_id: String(params[3]), status: params[4] as WorkflowRunRecord["status"], started_at: params[5] as string | null, completed_at: params[6] as string | null, triggered_by: params[7] as string | null, total_input_tokens: params[8] as number | null, total_output_tokens: params[9] as number | null, total_cost_usd: params[10] as number | null, pipeline_run_id: params[11] as number | null, metadata: params[12] as JsonRecord, created_at: now(), updated_at: now() };
      this.workflowRuns.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("update workflow_runs")) {
      const current = this.workflowRuns.get(String(params[0])); assert.ok(current);
      const row: WorkflowRunRecord = { ...current, status: params[1] as WorkflowRunRecord["status"], completed_at: (params[2] as string | null) ?? current.completed_at, updated_at: now() };
      this.workflowRuns.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("insert into workflow_node_runs")) {
      const row: WorkflowNodeRunRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_id: String(params[2]), node_type: params[3] as WorkflowNodeRunRecord["node_type"], role: params[4] as string | null, status: params[5] as WorkflowNodeRunRecord["status"], parent_node_run_id: params[6] as string | null, model: params[7] as string | null, prompt_version: params[8] as string | null, input_artifact_ids: params[9] as readonly string[], output_artifact_id: params[10] as string | null, started_at: params[11] as string | null, completed_at: params[12] as string | null, error: params[13] as string | null, pipeline_job_id: params[14] as number | null, metadata: params[15] as JsonRecord, created_at: now(), updated_at: now() };
      this.nodeRuns.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set status")) {
      const current = this.nodeRuns.get(String(params[0])); assert.ok(current);
      const row: WorkflowNodeRunRecord = { ...current, status: params[1] as WorkflowNodeRunRecord["status"], completed_at: (params[2] as string | null) ?? current.completed_at, error: (params[3] as string | null) ?? current.error, updated_at: now() };
      this.nodeRuns.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("update workflow_node_runs") && normalized.includes("set output_artifact_id")) {
      const current = this.nodeRuns.get(String(params[0])); assert.ok(current);
      const row: WorkflowNodeRunRecord = { ...current, output_artifact_id: String(params[1]), updated_at: now() };
      this.nodeRuns.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("insert into workflow_events")) {
      const row: WorkflowEventRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, event_type: params[3] as WorkflowEventRecord["event_type"], detail: params[4] as JsonRecord, created_at: now() };
      this.events.push(row); return [row] as T[];
    }
    if (normalized.startsWith("insert into artifacts")) {
      const row: ArtifactRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, artifact_type: String(params[3]), schema_version: String(params[4]), entity_type: params[5] as string | null, entity_id: params[6] as string | null, storage_uri: params[7] as string | null, json: params[8] as JsonValue | null, sha256: String(params[9]), created_at: now() };
      this.artifacts.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("insert into artifact_links")) {
      const row: ArtifactLinkRecord = { id: String(params[0]), workflow_run_id: String(params[1]), child_artifact_id: String(params[2]), parent_artifact_id: String(params[3]), link_type: params[4] as ArtifactLinkRecord["link_type"], metadata: params[5] as JsonRecord, created_at: now() };
      this.links.push(row); return [row] as T[];
    }
    if (normalized.startsWith("insert into agent_invocations")) {
      const row: AgentInvocationRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: String(params[2]), role: String(params[3]), provider: params[4] as string | null, model: params[5] as string | null, prompt_version: params[6] as string | null, input_artifact_ids: params[7] as readonly string[], output_artifact_id: params[8] as string | null, input_tokens: params[9] as number | null, output_tokens: params[10] as number | null, cost_usd: params[11] as number | null, latency_ms: params[12] as number | null, status: params[13] as AgentInvocationRecord["status"], error: params[14] as string | null, created_at: now() };
      this.invocations.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("insert into approval_gates")) {
      const row: ApprovalGateRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, gate_type: String(params[3]), status: params[4] as ApprovalGateRecord["status"], reason: params[5] as string | null, approved_by: params[6] as string | null, approved_at: params[7] as string | null, rejected_by: params[8] as string | null, rejected_at: params[9] as string | null, metadata: params[10] as JsonRecord, created_at: now() };
      this.gates.set(row.id, row); return [row] as T[];
    }
    throw new Error(`Unhandled SQL in video workflow fake: ${normalized}`);
  };
}

function repoWithDb(): { db: WorkflowDb; repo: ControlPlaneRepository } {
  const db = new WorkflowDb();
  return { db, repo: new ControlPlaneRepository(db.execute) };
}

test("video_intelligence_workflow creates evidence-linked call artifacts for high-confidence fixture", async () => {
  const { db, repo } = repoWithDb();
  const result = await runVideoIntelligenceWorkflow({
    videoId: "fixture-video-1",
    title: "BTC breakout plan",
    creatorHandle: "creator",
    transcript: "I am buying BTC around 90000, target 120000 over 60 days, invalidated below 85000. This is my call for the cycle.",
  }, { repository: repo, triggeredBy: "test" });

  assert.equal(result.status, "completed");
  assert.equal(result.state.validationReport?.requiresApproval, false);
  assert.equal(result.state.validationReport?.publicationDecision.decision, "publish");
  assert.equal(result.state.validationReport?.publicationDecision.suppression_required, false);
  assert.equal(result.state.normalizedCalls[0]?.marketSymbol, "BTCUSDT");
  assert.equal(result.state.normalizedCalls[0]?.status, "accepted_call");
  assert.deepEqual([...db.artifacts.values()].map((artifact) => artifact.artifact_type), [
    "video_metadata",
    "transcript_raw",
    "transcript_segments",
    "candidate_calls",
    "normalized_calls",
    "validation_report",
    "publication_decision",
  ]);
  const publicationArtifact = [...db.artifacts.values()].find((artifact) => artifact.artifact_type === "publication_decision");
  assert.ok(publicationArtifact);
  assert.equal((publicationArtifact.json as JsonRecord).decision, "publish");
  assert.equal(db.links.length, 6);
  assert.equal(db.gates.size, 0);
  assert.ok([...db.invocations.values()].some((invocation) => invocation.role === "video_intelligence_candidate_extractor"));
});

test("video_intelligence_workflow suppresses low-confidence or rejected call artifacts without founder approval", async () => {
  const { db, repo } = repoWithDb();
  const result = await runVideoIntelligenceWorkflow({
    videoId: "fixture-video-2",
    title: "Guest market chat",
    transcript: "My guest says SOL can double next month. I am only reporting what he said.",
  }, { repository: repo });

  assert.equal(result.status, "completed");
  assert.equal(result.state.validationReport?.requiresApproval, false);
  assert.equal(result.state.validationReport?.publicationDecision.decision, "suppress");
  assert.equal(result.state.validationReport?.publicationDecision.suppression_required, true);
  assert.equal(result.state.validationReport?.publicationDecision.non_founder_review_required, false);
  assert.equal(db.gates.size, 0);
  assert.deepEqual([...db.nodeRuns.values()].map((node) => node.node_id), [
    "fetch_video_metadata",
    "load_transcript",
    "segment_transcript",
    "extract_candidate_calls",
    "normalize_calls",
    "validate_evidence",
    "decide_publication",
    "non_founder_review_if_required",
  ]);
  const publicationArtifact = [...db.artifacts.values()].find((artifact) => artifact.artifact_type === "publication_decision");
  assert.ok(publicationArtifact);
  assert.deepEqual((publicationArtifact.json as JsonRecord).reason_codes, ["rejected_not_creator_owned"]);
  assert.equal(db.events.some((event) => event.event_type === "approval.requested"), false);
});

test("video_intelligence_workflow routes medium-confidence accepted calls to non-founder review", async () => {
  const { db, repo } = repoWithDb();
  const result = await runVideoIntelligenceWorkflow({
    videoId: "fixture-video-3",
    title: "Conditional ETH setup",
    transcript: "I think ETH might break out next month if the ETF flows continue.",
  }, { repository: repo });

  assert.equal(result.status, "awaiting_approval");
  assert.equal(result.state.validationReport?.requiresApproval, true);
  assert.equal(result.state.validationReport?.publicationDecision.decision, "review");
  assert.equal(result.state.validationReport?.publicationDecision.non_founder_review_required, true);
  assert.equal(db.gates.size, 1);
  assert.equal([...db.gates.values()][0].gate_type, "non_founder_trust_review");
  const publicationArtifact = [...db.artifacts.values()].find((artifact) => artifact.artifact_type === "publication_decision");
  assert.ok(publicationArtifact);
  assert.equal((publicationArtifact.json as JsonRecord).decision, "review");
});
