import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { wrapDirectFunctionNode } from "../operating-node-utils";
import { DEFAULT_OPERATING_MUTATION_FLAGS } from "../operating-graph-schemas";

function nowIso(): string {
  return new Date().toISOString();
}

function makeArtifactPath(root: string, name: string): string {
  const path = join(root, `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

export const trustReviewGoalLoopNode = wrapDirectFunctionNode({
  nodeId: "trust_goal_loop",
  domain: "trust_review",
  run: async ({ state, config }) => {
    const cfg = config?.configurable as Record<string, unknown> | undefined;
    const rawState = state as Record<string, unknown>;
    const artifacts = rawState.artifacts as Record<string, unknown> | undefined;
    const input = artifacts?.trust_decision_input as Record<string, unknown> | undefined;
    const resolution = cfg?.trustReviewResolution as { action?: string } | undefined;
    const gateId = cfg?.gateReceiptId as string | undefined;

    if (resolution && !gateId) {
      return {
        status: "blocked" as const,
        summary: "Blocked: trust review resolution requires gate evidence.",
        blockers: ["non_founder_gate_evidence_missing"],
        detail: { resolution_action: resolution.action ?? null, blocked_count: 1 },
        mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
      };
    }

    if (!input) {
      return {
        status: "skipped" as const,
        summary: "Skipped: no trust decision input provided.",
        detail: {
          pending_review_count: 0,
          founder_review_required_count: 0,
          note: "no_pending_trust_review_items",
        },
        mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
      };
    }

    const decision = "review";
    const artifactDir = ".tmp/workflow-receipts/callscore_operating_graph/trust";
    const artifactPath = makeArtifactPath(artifactDir, `trust-decision-${nowIso()}`);
    writeFileSync(artifactPath, JSON.stringify({ trust_decision: { decision, non_founder_review_required: true, founder_review_required: false } }, null, 2) + "\n", { mode: 0o600 });

    return {
      status: "ok" as const,
      summary: `Trust decision: ${decision}`,
      artifact_path: artifactPath,
      detail: {
        decision,
        trust_decision: decision,
        resolution_action: resolution?.action ?? null,
        pending_review_count: 0,
        note: `fixture_decision: ${decision}`,
        non_founder_review_required: true,
        founder_review_required: false,
      },
      mutation_flags: { ...DEFAULT_OPERATING_MUTATION_FLAGS },
    };
  },
});
