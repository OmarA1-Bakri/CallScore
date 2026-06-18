import type { WorkflowEventType, WorkflowNodeType, WorkflowStatus } from "./status";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonRecord = { readonly [key: string]: JsonValue };

export interface WorkflowRunRecord {
  readonly id: string;
  readonly workflow_name: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly status: WorkflowStatus;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly triggered_by: string | null;
  readonly total_input_tokens: number | null;
  readonly total_output_tokens: number | null;
  readonly total_cost_usd: string | number | null;
  readonly pipeline_run_id: number | null;
  readonly metadata: JsonRecord;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WorkflowNodeRunRecord {
  readonly id: string;
  readonly workflow_run_id: string;
  readonly node_id: string;
  readonly node_type: WorkflowNodeType;
  readonly role: string | null;
  readonly status: WorkflowStatus;
  readonly parent_node_run_id: string | null;
  readonly model: string | null;
  readonly prompt_version: string | null;
  readonly input_artifact_ids: readonly string[];
  readonly output_artifact_id: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly error: string | null;
  readonly pipeline_job_id: number | null;
  readonly metadata: JsonRecord;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WorkflowEventRecord {
  readonly id: string;
  readonly workflow_run_id: string;
  readonly node_run_id: string | null;
  readonly event_type: WorkflowEventType;
  readonly detail: JsonRecord;
  readonly created_at: string;
}

export interface ArtifactRecord {
  readonly id: string;
  readonly workflow_run_id: string;
  readonly node_run_id: string | null;
  readonly artifact_type: string;
  readonly schema_version: string;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly storage_uri: string | null;
  readonly json: JsonValue | null;
  readonly sha256: string;
  readonly created_at: string;
}

export interface AgentInvocationRecord {
  readonly id: string;
  readonly workflow_run_id: string;
  readonly node_run_id: string;
  readonly role: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly prompt_version: string | null;
  readonly input_artifact_ids: readonly string[];
  readonly output_artifact_id: string | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly cost_usd: string | number | null;
  readonly latency_ms: number | null;
  readonly status: WorkflowStatus;
  readonly error: string | null;
  readonly created_at: string;
}

export interface ApprovalGateRecord {
  readonly id: string;
  readonly workflow_run_id: string;
  readonly node_run_id: string | null;
  readonly gate_type: string;
  readonly status: WorkflowStatus;
  readonly reason: string | null;
  readonly approved_by: string | null;
  readonly approved_at: string | null;
  readonly rejected_by: string | null;
  readonly rejected_at: string | null;
  readonly metadata: JsonRecord;
  readonly created_at: string;
}

export interface CreateWorkflowRunInput {
  readonly id?: string;
  readonly workflowName: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly status?: WorkflowStatus;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly triggeredBy?: string | null;
  readonly totalInputTokens?: number | null;
  readonly totalOutputTokens?: number | null;
  readonly totalCostUsd?: number | null;
  readonly pipelineRunId?: number | null;
  readonly metadata?: JsonRecord;
}

export interface CreateWorkflowNodeRunInput {
  readonly id?: string;
  readonly workflowRunId: string;
  readonly nodeId: string;
  readonly nodeType: WorkflowNodeType;
  readonly role?: string | null;
  readonly status?: WorkflowStatus;
  readonly parentNodeRunId?: string | null;
  readonly model?: string | null;
  readonly promptVersion?: string | null;
  readonly inputArtifactIds?: readonly string[];
  readonly outputArtifactId?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly error?: string | null;
  readonly pipelineJobId?: number | null;
  readonly metadata?: JsonRecord;
}

export interface CreateWorkflowEventInput {
  readonly id?: string;
  readonly workflowRunId: string;
  readonly nodeRunId?: string | null;
  readonly eventType: WorkflowEventType;
  readonly detail?: JsonRecord;
}

export interface CreateArtifactInput {
  readonly id?: string;
  readonly workflowRunId: string;
  readonly nodeRunId?: string | null;
  readonly artifactType: string;
  readonly schemaVersion: string;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly storageUri?: string | null;
  readonly json?: JsonValue | null;
  readonly sha256?: string;
}

export interface CreateAgentInvocationInput {
  readonly id?: string;
  readonly workflowRunId: string;
  readonly nodeRunId: string;
  readonly role: string;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly promptVersion?: string | null;
  readonly inputArtifactIds?: readonly string[];
  readonly outputArtifactId?: string | null;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly costUsd?: number | null;
  readonly latencyMs?: number | null;
  readonly status?: WorkflowStatus;
  readonly error?: string | null;
}

export interface CreateApprovalGateInput {
  readonly id?: string;
  readonly workflowRunId: string;
  readonly nodeRunId?: string | null;
  readonly gateType: string;
  readonly status?: WorkflowStatus;
  readonly reason?: string | null;
  readonly approvedBy?: string | null;
  readonly approvedAt?: string | null;
  readonly rejectedBy?: string | null;
  readonly rejectedAt?: string | null;
  readonly metadata?: JsonRecord;
}

export type ControlPlaneQueryExecutor = <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;
