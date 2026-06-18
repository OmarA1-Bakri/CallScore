import type { ControlPlaneRepository } from "./repository";
import type { AgentInvocationRecord, ApprovalGateRecord, ArtifactRecord, WorkflowEventRecord, WorkflowNodeRunRecord, WorkflowRunRecord } from "./types";

export interface WorkflowRunDetail {
  readonly run: WorkflowRunRecord;
  readonly nodes: readonly WorkflowNodeRunRecord[];
  readonly artifacts: readonly ArtifactRecord[];
  readonly events: readonly WorkflowEventRecord[];
  readonly approvalGates: readonly ApprovalGateRecord[];
  readonly totals: {
    readonly nodes: number;
    readonly artifacts: number;
    readonly events: number;
    readonly approvalGates: number;
    readonly totalInputTokens: number;
    readonly totalOutputTokens: number;
    readonly totalCostUsd: number;
  };
}

export interface ControlPlaneOverview {
  readonly runs: readonly WorkflowRunRecord[];
  readonly blockedItems: readonly { readonly kind: "node" | "approval_gate"; readonly id: string; readonly workflow_run_id: string; readonly status: string; readonly reason: string | null; readonly created_at: string }[];
}

export function redactArtifactForObservation(artifact: ArtifactRecord): ArtifactRecord {
  if (!artifact.json || typeof artifact.json !== "object" || Array.isArray(artifact.json)) return artifact;
  const blocked = new Set(["api_key", "authorization", "cookie", "password", "secret", "token"]);
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      blocked.has(key.toLowerCase()) ? "[REDACTED]" : scrub(nested),
    ]));
  };
  return { ...artifact, json: scrub(artifact.json) as ArtifactRecord["json"] };
}

export async function buildControlPlaneOverview(repository: ControlPlaneRepository, limit = 50): Promise<ControlPlaneOverview> {
  const [runs, blockedItems] = await Promise.all([
    repository.listWorkflowRuns(limit),
    repository.listBlockedItems(limit),
  ]);
  return { runs, blockedItems };
}

export async function buildWorkflowRunDetail(repository: ControlPlaneRepository, workflowRunId: string): Promise<WorkflowRunDetail | null> {
  const run = await repository.getWorkflowRun(workflowRunId);
  if (!run) return null;
  const [nodes, artifacts, events, approvalGates] = await Promise.all([
    repository.listWorkflowNodeRuns(workflowRunId),
    repository.listWorkflowArtifacts(workflowRunId),
    repository.listWorkflowEvents(workflowRunId),
    repository.listWorkflowApprovalGates(workflowRunId),
  ]);
  return {
    run,
    nodes,
    artifacts: artifacts.map(redactArtifactForObservation),
    events,
    approvalGates,
    totals: {
      nodes: nodes.length,
      artifacts: artifacts.length,
      events: events.length,
      approvalGates: approvalGates.length,
      totalInputTokens: Number(run.total_input_tokens ?? 0),
      totalOutputTokens: Number(run.total_output_tokens ?? 0),
      totalCostUsd: Number(run.total_cost_usd ?? 0),
    },
  };
}

export async function buildEntityLineage(repository: ControlPlaneRepository, entityType: string, entityId: string): Promise<readonly ArtifactRecord[]> {
  const artifacts = await repository.listArtifactsForEntity(entityType, entityId);
  return artifacts.map(redactArtifactForObservation);
}

export function summarizeAgentInvocations(invocations: readonly AgentInvocationRecord[]): { readonly totalInputTokens: number; readonly totalOutputTokens: number; readonly totalCostUsd: number } {
  return invocations.reduce((acc, invocation) => ({
    totalInputTokens: acc.totalInputTokens + Number(invocation.input_tokens ?? 0),
    totalOutputTokens: acc.totalOutputTokens + Number(invocation.output_tokens ?? 0),
    totalCostUsd: acc.totalCostUsd + Number(invocation.cost_usd ?? 0),
  }), { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 });
}
