import type { ControlPlaneRepository } from "./repository";
import type {
  ArtifactRecord,
  CreateArtifactInput,
  JsonRecord,
  WorkflowNodeRunRecord,
  WorkflowRunRecord,
} from "./types";
import type { WorkflowNodeType, WorkflowStatus } from "./status";

export type WorkflowTerminalStatus = Extract<WorkflowStatus, "completed" | "failed" | "cancelled" | "blocked" | "awaiting_approval">;
export type WorkflowRuntimeNodeStatus = Extract<WorkflowStatus, "completed" | "failed" | "skipped" | "awaiting_approval" | "cancelled" | "blocked">;

export type WorkflowNodeHandler = (context: WorkflowNodeContext) => Promise<WorkflowNodeHandlerResult> | WorkflowNodeHandlerResult;

export interface WorkflowNode {
  readonly id: string;
  readonly type: WorkflowNodeType;
  readonly dependsOn?: readonly string[];
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
  readonly role?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly run: WorkflowNodeHandler;
}

export interface WorkflowDefinition {
  readonly name: string;
  readonly version: string;
  readonly entityType: string;
  readonly nodes: readonly WorkflowNode[];
  readonly maxIterations?: number;
}

export interface WorkflowRunInput {
  readonly entityId: string;
  readonly triggeredBy?: string | null;
  readonly idempotencyKey?: string;
  readonly metadata?: JsonRecord;
}

export interface WorkflowNodeContext {
  readonly definition: WorkflowDefinition;
  readonly workflowRun: WorkflowRunRecord;
  readonly nodeRun: WorkflowNodeRunRecord;
  readonly node: WorkflowNode;
  readonly entityType: string;
  readonly entityId: string;
  readonly inputArtifactIds: readonly string[];
  readonly dependencyOutputs: ReadonlyMap<string, readonly string[]>;
  readonly repository: ControlPlaneRepository;
  readonly attempt: number;
  readonly maxAttempts: number;
}

export interface WorkflowOutputArtifactInput extends Omit<CreateArtifactInput, "workflowRunId" | "nodeRunId"> {
  readonly parentArtifactIds?: readonly string[];
}

export interface WorkflowNodeHandlerResult {
  readonly status?: WorkflowRuntimeNodeStatus;
  readonly reason?: string;
  readonly metadata?: JsonRecord;
  readonly outputArtifact?: WorkflowOutputArtifactInput;
  readonly outputArtifacts?: readonly WorkflowOutputArtifactInput[];
  readonly outputArtifactIds?: readonly string[];
}

export interface WorkflowRunResult {
  readonly workflowRun: WorkflowRunRecord;
  readonly status: WorkflowTerminalStatus;
  readonly nodeRuns: readonly WorkflowNodeRunRecord[];
  readonly outputArtifactIds: readonly string[];
  readonly reusedExistingRun: boolean;
}

export interface WorkflowIdempotencyStore {
  get(key: string): Promise<WorkflowRunRecord | undefined> | WorkflowRunRecord | undefined;
  set(key: string, run: WorkflowRunRecord): Promise<void> | void;
}

export class MemoryWorkflowIdempotencyStore implements WorkflowIdempotencyStore {
  private readonly runs = new Map<string, WorkflowRunRecord>();

  get(key: string): WorkflowRunRecord | undefined {
    return this.runs.get(key);
  }

  set(key: string, run: WorkflowRunRecord): void {
    this.runs.set(key, run);
  }
}

export interface WorkflowRuntimeOptions {
  readonly idempotencyStore?: WorkflowIdempotencyStore;
  readonly defaultMaxAttempts?: number;
  readonly maxIterations?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function topologicalSort(nodes: readonly WorkflowNode[], maxIterations: number): WorkflowNode[] {
  if (nodes.length > maxIterations) throw new Error("workflow_definition_exceeds_max_iterations");

  const byId = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) throw new Error(`workflow_definition_duplicate_node:${node.id}`);
    byId.set(node.id, node);
  }

  for (const node of nodes) {
    for (const dependency of node.dependsOn ?? []) {
      if (!byId.has(dependency)) throw new Error(`workflow_definition_missing_dependency:${node.id}:${dependency}`);
    }
  }

  const sorted: WorkflowNode[] = [];
  const permanent = new Set<string>();
  const temporary = new Set<string>();

  const visit = (node: WorkflowNode) => {
    if (permanent.has(node.id)) return;
    if (temporary.has(node.id)) throw new Error("workflow_definition_has_cycle_or_missing_dependency");
    temporary.add(node.id);
    for (const dependency of node.dependsOn ?? []) visit(byId.get(dependency)!);
    temporary.delete(node.id);
    permanent.add(node.id);
    sorted.push(node);
  };

  for (const node of nodes) visit(node);
  if (sorted.length !== nodes.length) throw new Error("workflow_definition_has_cycle_or_missing_dependency");
  return sorted;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, nodeId: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`workflow_node_timeout:${nodeId}:${timeoutMs}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class WorkflowRuntime {
  private readonly idempotencyStore?: WorkflowIdempotencyStore;
  private readonly defaultMaxAttempts: number;
  private readonly maxIterations: number;

  constructor(private readonly repository: ControlPlaneRepository, options: WorkflowRuntimeOptions = {}) {
    this.idempotencyStore = options.idempotencyStore;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.maxIterations = options.maxIterations ?? 100;
  }

  async run(definition: WorkflowDefinition, input: WorkflowRunInput): Promise<WorkflowRunResult> {
    const orderedNodes = topologicalSort(definition.nodes, definition.maxIterations ?? this.maxIterations);
    const idempotencyKey = input.idempotencyKey;
    const existingRun = idempotencyKey ? await this.idempotencyStore?.get(idempotencyKey) : undefined;
    if (existingRun) {
      return {
        workflowRun: existingRun,
        status: existingRun.status as WorkflowTerminalStatus,
        nodeRuns: [],
        outputArtifactIds: [],
        reusedExistingRun: true,
      };
    }

    let workflowRun = await this.repository.startWorkflowRun({
      workflowName: definition.name,
      entityType: definition.entityType,
      entityId: input.entityId,
      triggeredBy: input.triggeredBy ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        workflow_version: definition.version,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      },
    });
    if (idempotencyKey) await this.idempotencyStore?.set(idempotencyKey, workflowRun);

    const nodeRuns: WorkflowNodeRunRecord[] = [];
    const dependencyOutputs = new Map<string, readonly string[]>();
    const allOutputArtifactIds: string[] = [];

    const finishWorkflow = async (status: WorkflowTerminalStatus, detail: JsonRecord = {}): Promise<WorkflowRunResult> => {
      workflowRun = await this.repository.updateWorkflowRunStatus(workflowRun.id, status, detail);
      if (idempotencyKey) await this.idempotencyStore?.set(idempotencyKey, workflowRun);
      return { workflowRun, status, nodeRuns, outputArtifactIds: allOutputArtifactIds, reusedExistingRun: false };
    };

    for (const node of orderedNodes) {
      const inputArtifactIds = (node.dependsOn ?? []).flatMap((dependency) => [...(dependencyOutputs.get(dependency) ?? [])]);
      const maxAttempts = Math.max(1, node.maxAttempts ?? this.defaultMaxAttempts);
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const nodeRun = await this.repository.startNodeRun({
          workflowRunId: workflowRun.id,
          nodeId: node.id,
          nodeType: node.type,
          role: node.role ?? null,
          model: node.model ?? null,
          promptVersion: node.promptVersion ?? null,
          inputArtifactIds,
          metadata: { attempt, max_attempts: maxAttempts, workflow_version: definition.version },
        });
        nodeRuns.push(nodeRun);

        try {
          const context: WorkflowNodeContext = {
            definition,
            workflowRun,
            nodeRun,
            node,
            entityType: definition.entityType,
            entityId: input.entityId,
            inputArtifactIds,
            dependencyOutputs,
            repository: this.repository,
            attempt,
            maxAttempts,
          };
          const result = await withTimeout(Promise.resolve(node.run(context)), node.timeoutMs, node.id);
          const outputArtifactIds = [...(result.outputArtifactIds ?? [])];
          const outputArtifacts = [
            ...(result.outputArtifact ? [result.outputArtifact] : []),
            ...(result.outputArtifacts ?? []),
          ];

          for (const outputArtifact of outputArtifacts) {
            const artifact: ArtifactRecord = await this.repository.createLinkedArtifact({
              ...outputArtifact,
              workflowRunId: workflowRun.id,
              nodeRunId: nodeRun.id,
              entityType: outputArtifact.entityType ?? definition.entityType,
              entityId: outputArtifact.entityId ?? input.entityId,
              parentArtifactIds: outputArtifact.parentArtifactIds ?? inputArtifactIds,
            });
            outputArtifactIds.push(artifact.id);
          }

          if (outputArtifactIds.length > 0) {
            await this.repository.attachNodeOutputArtifact(nodeRun.id, outputArtifactIds[0]);
            allOutputArtifactIds.push(...outputArtifactIds);
          }
          dependencyOutputs.set(node.id, outputArtifactIds);

          const requestedStatus = result.status ?? (node.type === "cancel" ? "cancelled" : "completed");
          if (requestedStatus === "completed") {
            await this.repository.updateNodeRunStatus(nodeRun.id, "completed", {
              output_artifact_ids: outputArtifactIds,
              ...(result.metadata ?? {}),
            });
            break;
          }

          if (requestedStatus === "skipped") {
            await this.repository.updateNodeRunStatus(nodeRun.id, "skipped", { reason: result.reason ?? "skipped", ...(result.metadata ?? {}) });
            break;
          }

          if (requestedStatus === "awaiting_approval") {
            await this.repository.updateNodeRunStatus(nodeRun.id, "awaiting_approval", { reason: result.reason ?? "awaiting_approval", ...(result.metadata ?? {}) });
            return finishWorkflow("awaiting_approval", { node_id: node.id, reason: result.reason ?? "awaiting_approval" });
          }

          if (requestedStatus === "cancelled") {
            await this.repository.updateNodeRunStatus(nodeRun.id, "cancelled", { reason: result.reason ?? "cancelled", ...(result.metadata ?? {}) });
            return finishWorkflow("cancelled", { node_id: node.id, reason: result.reason ?? "cancelled" });
          }

          if (requestedStatus === "blocked") {
            await this.repository.updateNodeRunStatus(nodeRun.id, "blocked", { reason: result.reason ?? "blocked", ...(result.metadata ?? {}) });
            return finishWorkflow("blocked", { node_id: node.id, reason: result.reason ?? "blocked" });
          }

          if (requestedStatus === "failed") {
            throw new Error(result.reason ?? "workflow_node_returned_failed");
          }
        } catch (error) {
          lastError = errorMessage(error);
          await this.repository.updateNodeRunStatus(nodeRun.id, "failed", { error: lastError, attempt, max_attempts: maxAttempts });
          if (attempt === maxAttempts) {
            return finishWorkflow("failed", { node_id: node.id, error: lastError, attempts: maxAttempts });
          }
        }
      }

      if (lastError) continue;
    }

    return finishWorkflow("completed", { node_count: orderedNodes.length });
  }
}
