export const WORKFLOW_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "awaiting_approval",
  "cancelled",
  "blocked",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_NODE_TYPES = [
  "deterministic",
  "llm_structured",
  "parallel_review",
  "approval",
  "delay_until",
  "cancel",
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WORKFLOW_EVENT_TYPES = [
  "workflow.started",
  "workflow.completed",
  "workflow.failed",
  "node.started",
  "node.completed",
  "node.failed",
  "artifact.created",
  "agent_invocation.started",
  "agent_invocation.completed",
  "agent_invocation.failed",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "gate.blocked",
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function mapPipelineStatusToWorkflowStatus(status: string): WorkflowStatus {
  switch (status) {
    case "queued":
    case "pending":
      return "pending";
    case "running":
      return "running";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "blocked";
  }
}
