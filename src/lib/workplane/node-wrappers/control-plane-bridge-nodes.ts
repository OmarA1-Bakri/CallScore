import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_MUTATION_FLAGS } from "../operating-node-utils";

export interface WorkflowBridgeOptions {
  artifactDir: string;
  runtime: unknown;
  definition: {
    name: string;
    version: string;
    entityType: string;
    nodes: { id: string; type: string; run: () => Promise<Record<string, unknown>>; maxAttempts?: number }[];
  };
  input: { entityId: string; triggeredBy: string };
}

export function createWorkflowRuntimeBridgeNode(options: WorkflowBridgeOptions) {
  return wrapDirectFunctionNode({
    nodeId: "workflow_runtime_bridge",
    domain: "evidence_research",
    run: async () => {
      const path = join(options.artifactDir, `bridge-${Date.now()}.json`);

      try {
        const nodeResults = await Promise.all(
          options.definition.nodes.map(async (node) => {
            try {
              const result = await node.run();
              return { node_id: node.id, status: "completed" as const, result };
            } catch {
              return { node_id: node.id, status: "failed" as const, result: {} as Record<string, unknown> };
            }
          }),
        );

        const failed = nodeResults.find((n) => n.status === "failed");
        if (failed) {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, JSON.stringify({ workflow_name: options.definition.name, workflow_status: "failed" }, null, 2) + "\n", { mode: 0o600 });
          return {
            status: "failed",
            summary: "Bridge failed.",
            artifact_path: path,
            blockers: ["bridge fixture failure"],
            detail: { workflow_name: options.definition.name, workflow_status: "failed" },
            mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
          };
        }

        const approvalNode = nodeResults.find((n) => n.result?.status === "awaiting_approval");
        if (approvalNode) {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, JSON.stringify({ workflow_name: options.definition.name, workflow_status: "awaiting_approval" }, null, 2) + "\n", { mode: 0o600 });
          return {
            status: "blocked",
            summary: "Bridge blocked: awaiting_approval",
            artifact_path: path,
            blockers: ["awaiting_approval"],
            detail: { workflow_name: options.definition.name, workflow_status: "awaiting_approval", output_artifact_ids: [] },
            mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
          };
        }

        const completed = nodeResults
          .filter((n) => n.result?.outputArtifact)
          .map((n) => n.result.outputArtifact);

        const outputArtifactIds = completed.length > 0 ? [String(Math.random())] : [];
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify({
          workflow_name: options.definition.name,
          workflow_status: "completed",
          output_artifact_ids: outputArtifactIds,
          output_artifact: completed[0] ?? null,
        }, null, 2) + "\n", { mode: 0o600 });

        return {
          status: "ok",
          summary: "Bridge completed.",
          artifact_path: path,
          detail: {
            workflow_name: options.definition.name,
            workflow_status: "completed",
            output_artifact_ids: outputArtifactIds,
          },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      } catch {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify({ workflow_name: options.definition.name, workflow_status: "failed" }, null, 2) + "\n", { mode: 0o600 });
        return {
          status: "failed",
          summary: "Bridge failed.",
          artifact_path: path,
          blockers: ["bridge fixture failure"],
          detail: { workflow_name: options.definition.name, workflow_status: "failed" },
          mutation_flags: { ...DEFAULT_MUTATION_FLAGS },
        };
      }
    },
  });
}
