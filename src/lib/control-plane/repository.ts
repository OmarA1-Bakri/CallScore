import { randomUUID } from "node:crypto";
import { query } from "../db";
import { assertSha256, checksumArtifact } from "./checksum";
import type {
  AgentInvocationRecord,
  ApprovalGateRecord,
  ArtifactRecord,
  ControlPlaneQueryExecutor,
  CreateAgentInvocationInput,
  CreateApprovalGateInput,
  CreateArtifactInput,
  CreateWorkflowEventInput,
  CreateWorkflowNodeRunInput,
  CreateWorkflowRunInput,
  JsonRecord,
  WorkflowEventRecord,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
} from "./types";
import type { WorkflowEventType, WorkflowStatus } from "./status";

function id(input?: string): string {
  return input ?? randomUUID();
}

function jsonRecord(input: JsonRecord | undefined): JsonRecord {
  return input ?? {};
}

function jsonArray(input: readonly string[] | undefined): readonly string[] {
  return input ?? [];
}

async function one<T>(executor: ControlPlaneQueryExecutor, sql: string, params: readonly unknown[]): Promise<T> {
  const rows = await executor<T>(sql, params);
  const row = rows[0];
  if (!row) throw new Error("control_plane_write_returned_no_rows");
  return row;
}

const defaultExecutor: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
  return query<T>(sql, [...params]);
};

export class ControlPlaneRepository {
  constructor(private readonly executor: ControlPlaneQueryExecutor = defaultExecutor) {}

  async createWorkflowRun(input: CreateWorkflowRunInput): Promise<WorkflowRunRecord> {
    return one<WorkflowRunRecord>(this.executor, `
      INSERT INTO workflow_runs (
        id,
        workflow_name,
        entity_type,
        entity_id,
        status,
        started_at,
        completed_at,
        triggered_by,
        total_input_tokens,
        total_output_tokens,
        total_cost_usd,
        pipeline_run_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING *
    `, [
      id(input.id),
      input.workflowName,
      input.entityType,
      input.entityId,
      input.status ?? "pending",
      input.startedAt ?? null,
      input.completedAt ?? null,
      input.triggeredBy ?? null,
      input.totalInputTokens ?? null,
      input.totalOutputTokens ?? null,
      input.totalCostUsd ?? null,
      input.pipelineRunId ?? null,
      jsonRecord(input.metadata),
    ]);
  }

  async startWorkflowRun(input: Omit<CreateWorkflowRunInput, "status" | "startedAt"> & { readonly startedAt?: string | null }): Promise<WorkflowRunRecord> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const run = await this.createWorkflowRun({ ...input, status: "running", startedAt });
    await this.recordEvent({
      workflowRunId: run.id,
      eventType: "workflow.started",
      detail: { workflow_name: run.workflow_name, entity_type: run.entity_type, entity_id: run.entity_id },
    });
    return run;
  }

  async updateWorkflowRunStatus(
    workflowRunId: string,
    status: Extract<WorkflowStatus, "completed" | "failed" | "cancelled" | "blocked" | "awaiting_approval">,
    detail: JsonRecord = {},
  ): Promise<WorkflowRunRecord> {
    const completedAt = ["completed", "failed", "cancelled", "blocked"].includes(status) ? new Date().toISOString() : null;
    const run = await one<WorkflowRunRecord>(this.executor, `
      UPDATE workflow_runs
         SET status = $2,
             completed_at = COALESCE($3::timestamptz, completed_at),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *
    `, [workflowRunId, status, completedAt]);
    const eventType: WorkflowEventType = status === "completed"
      ? "workflow.completed"
      : status === "failed"
        ? "workflow.failed"
        : status === "blocked"
          ? "gate.blocked"
          : "workflow.failed";
    await this.recordEvent({ workflowRunId, eventType, detail: { status, ...detail } });
    return run;
  }

  async createWorkflowNodeRun(input: CreateWorkflowNodeRunInput): Promise<WorkflowNodeRunRecord> {
    return one<WorkflowNodeRunRecord>(this.executor, `
      INSERT INTO workflow_node_runs (
        id,
        workflow_run_id,
        node_id,
        node_type,
        role,
        status,
        parent_node_run_id,
        model,
        prompt_version,
        input_artifact_ids,
        output_artifact_id,
        started_at,
        completed_at,
        error,
        pipeline_job_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::timestamptz, $13::timestamptz, $14, $15, $16::jsonb)
      RETURNING *
    `, [
      id(input.id),
      input.workflowRunId,
      input.nodeId,
      input.nodeType,
      input.role ?? null,
      input.status ?? "pending",
      input.parentNodeRunId ?? null,
      input.model ?? null,
      input.promptVersion ?? null,
      jsonArray(input.inputArtifactIds),
      input.outputArtifactId ?? null,
      input.startedAt ?? null,
      input.completedAt ?? null,
      input.error ?? null,
      input.pipelineJobId ?? null,
      jsonRecord(input.metadata),
    ]);
  }

  async startNodeRun(input: Omit<CreateWorkflowNodeRunInput, "status" | "startedAt"> & { readonly startedAt?: string | null }): Promise<WorkflowNodeRunRecord> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const node = await this.createWorkflowNodeRun({ ...input, status: "running", startedAt });
    await this.recordEvent({
      workflowRunId: node.workflow_run_id,
      nodeRunId: node.id,
      eventType: "node.started",
      detail: { node_id: node.node_id, node_type: node.node_type, role: node.role },
    });
    return node;
  }

  async updateNodeRunStatus(
    nodeRunId: string,
    status: Extract<WorkflowStatus, "completed" | "failed" | "skipped" | "awaiting_approval" | "cancelled" | "blocked">,
    detail: JsonRecord = {},
  ): Promise<WorkflowNodeRunRecord> {
    const completedAt = ["completed", "failed", "skipped", "cancelled", "blocked"].includes(status) ? new Date().toISOString() : null;
    const node = await one<WorkflowNodeRunRecord>(this.executor, `
      UPDATE workflow_node_runs
         SET status = $2,
             completed_at = COALESCE($3::timestamptz, completed_at),
             error = COALESCE($4, error),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *
    `, [nodeRunId, status, completedAt, typeof detail.error === "string" ? detail.error : null]);
    const eventType: WorkflowEventType = status === "completed"
      ? "node.completed"
      : status === "failed"
        ? "node.failed"
        : status === "blocked"
          ? "gate.blocked"
          : "node.failed";
    await this.recordEvent({ workflowRunId: node.workflow_run_id, nodeRunId, eventType, detail: { status, ...detail } });
    return node;
  }

  async attachNodeOutputArtifact(nodeRunId: string, artifactId: string): Promise<WorkflowNodeRunRecord> {
    return one<WorkflowNodeRunRecord>(this.executor, `
      UPDATE workflow_node_runs
         SET output_artifact_id = $2,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *
    `, [nodeRunId, artifactId]);
  }

  async recordEvent(input: CreateWorkflowEventInput): Promise<WorkflowEventRecord> {
    return one<WorkflowEventRecord>(this.executor, `
      INSERT INTO workflow_events (
        id,
        workflow_run_id,
        node_run_id,
        event_type,
        detail
      ) VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING *
    `, [
      id(input.id),
      input.workflowRunId,
      input.nodeRunId ?? null,
      input.eventType,
      jsonRecord(input.detail),
    ]);
  }

  async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    if (input.json === undefined && !input.storageUri) throw new Error("artifact_requires_json_or_storage_uri");
    const sha256 = assertSha256(input.sha256 ?? checksumArtifact(input));
    const artifact = await one<ArtifactRecord>(this.executor, `
      INSERT INTO artifacts (
        id,
        workflow_run_id,
        node_run_id,
        artifact_type,
        schema_version,
        entity_type,
        entity_id,
        storage_uri,
        json,
        sha256
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      RETURNING *
    `, [
      id(input.id),
      input.workflowRunId,
      input.nodeRunId ?? null,
      input.artifactType,
      input.schemaVersion,
      input.entityType ?? null,
      input.entityId ?? null,
      input.storageUri ?? null,
      input.json ?? null,
      sha256,
    ]);
    await this.recordEvent({
      workflowRunId: artifact.workflow_run_id,
      nodeRunId: artifact.node_run_id,
      eventType: "artifact.created",
      detail: { artifact_id: artifact.id, artifact_type: artifact.artifact_type, sha256: artifact.sha256 },
    });
    return artifact;
  }

  async recordAgentInvocation(input: CreateAgentInvocationInput): Promise<AgentInvocationRecord> {
    const invocation = await one<AgentInvocationRecord>(this.executor, `
      INSERT INTO agent_invocations (
        id,
        workflow_run_id,
        node_run_id,
        role,
        provider,
        model,
        prompt_version,
        input_artifact_ids,
        output_artifact_id,
        input_tokens,
        output_tokens,
        cost_usd,
        latency_ms,
        status,
        error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      id(input.id),
      input.workflowRunId,
      input.nodeRunId,
      input.role,
      input.provider ?? null,
      input.model ?? null,
      input.promptVersion ?? null,
      jsonArray(input.inputArtifactIds),
      input.outputArtifactId ?? null,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      input.costUsd ?? null,
      input.latencyMs ?? null,
      input.status ?? "completed",
      input.error ?? null,
    ]);
    const eventType: WorkflowEventType = invocation.status === "failed"
      ? "agent_invocation.failed"
      : invocation.status === "running"
        ? "agent_invocation.started"
        : "agent_invocation.completed";
    await this.recordEvent({
      workflowRunId: invocation.workflow_run_id,
      nodeRunId: invocation.node_run_id,
      eventType,
      detail: { agent_invocation_id: invocation.id, role: invocation.role, provider: invocation.provider, model: invocation.model, status: invocation.status },
    });
    return invocation;
  }

  async requestApprovalGate(input: Omit<CreateApprovalGateInput, "status">): Promise<ApprovalGateRecord> {
    const gate = await this.createApprovalGate({ ...input, status: "awaiting_approval" });
    await this.recordEvent({
      workflowRunId: gate.workflow_run_id,
      nodeRunId: gate.node_run_id,
      eventType: "approval.requested",
      detail: { approval_gate_id: gate.id, gate_type: gate.gate_type, reason: gate.reason },
    });
    return gate;
  }

  async createApprovalGate(input: CreateApprovalGateInput): Promise<ApprovalGateRecord> {
    return one<ApprovalGateRecord>(this.executor, `
      INSERT INTO approval_gates (
        id,
        workflow_run_id,
        node_run_id,
        gate_type,
        status,
        reason,
        approved_by,
        approved_at,
        rejected_by,
        rejected_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10::timestamptz, $11::jsonb)
      RETURNING *
    `, [
      id(input.id),
      input.workflowRunId,
      input.nodeRunId ?? null,
      input.gateType,
      input.status ?? "awaiting_approval",
      input.reason ?? null,
      input.approvedBy ?? null,
      input.approvedAt ?? null,
      input.rejectedBy ?? null,
      input.rejectedAt ?? null,
      jsonRecord(input.metadata),
    ]);
  }

  async resolveApprovalGate(
    approvalGateId: string,
    decision: "approved" | "rejected",
    actor: string,
    detail: JsonRecord = {},
  ): Promise<ApprovalGateRecord> {
    const approved = decision === "approved";
    const gate = await one<ApprovalGateRecord>(this.executor, `
      UPDATE approval_gates
         SET status = $2,
             approved_by = CASE WHEN $3::boolean THEN $4 ELSE approved_by END,
             approved_at = CASE WHEN $3::boolean THEN NOW() ELSE approved_at END,
             rejected_by = CASE WHEN NOT $3::boolean THEN $4 ELSE rejected_by END,
             rejected_at = CASE WHEN NOT $3::boolean THEN NOW() ELSE rejected_at END
       WHERE id = $1
       RETURNING *
    `, [approvalGateId, approved ? "completed" : "blocked", approved, actor]);
    await this.recordEvent({
      workflowRunId: gate.workflow_run_id,
      nodeRunId: gate.node_run_id,
      eventType: approved ? "approval.approved" : "approval.rejected",
      detail: { approval_gate_id: gate.id, gate_type: gate.gate_type, actor, ...detail },
    });
    return gate;
  }
}

export const controlPlane = new ControlPlaneRepository();
