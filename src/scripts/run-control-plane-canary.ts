import { controlPlane } from "../lib/control-plane";
import { writeJsonFile } from "../lib/shadow-extraction";
import { createScoreBoundaryArtifacts } from "../lib/scoring-boundary";
import { runVideoIntelligenceWorkflow } from "../lib/workflows/video-intelligence";
import { timestamp } from "./script-helpers";

function argValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0 || !argv[index + 1]) return null;
  return argv[index + 1];
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const generatedAt = timestamp();
  const suffix = generatedAt.replace(/[-:.]/g, "").slice(0, 15);
  const videoId = argValue(argv, "--video-id") ?? `prod-control-plane-canary-${suffix}`;
  const callId = argValue(argv, "--call-id") ?? `${videoId}-call-1`;
  const receiptPath = argValue(argv, "--receipt-out") ?? `.tmp/workflow-receipts/control-plane-canary/${videoId}.json`;
  const skipScoring = hasFlag(argv, "--skip-scoring");

  const workflow = await runVideoIntelligenceWorkflow({
    videoId,
    title: "Production control-plane canary fixture",
    creatorHandle: "callscore-canary",
    transcript: "I am buying BTC around 100000, target 125000 over 30 days, invalidated below 95000.",
  }, { repository: controlPlane, triggeredBy: "hermes_production_canary" });

  const artifacts = await controlPlane.listWorkflowArtifacts(workflow.workflowRun.id);
  const normalizedArtifact = artifacts.find((artifact) => artifact.artifact_type === "normalized_calls");
  if (!normalizedArtifact) throw new Error("canary_missing_normalized_calls_artifact");

  const scoring = skipScoring ? null : await createScoreBoundaryArtifacts({
    repository: controlPlane,
    workflowRunId: workflow.workflowRun.id,
    nodeRunId: workflow.nodeRuns.find((node) => node.node_id === "validate_evidence")?.id ?? null,
    normalizedCallArtifactId: normalizedArtifact.id,
    callId,
    marketSymbol: "BTCUSDT",
    direction: "bullish",
    confidence: 0.9,
    callTimestamp: "2026-01-01T00:00:00.000Z",
    horizonTimestamp: "2026-01-31T00:00:00.000Z",
    candles: [
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-01T00:00:00.000Z", priceUsd: 100000, provider: "production_canary_fixture" },
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-31T00:00:00.000Z", priceUsd: 125000, provider: "production_canary_fixture" },
    ],
  });

  const lineage = scoring ? await controlPlane.listArtifactLineage(scoring.scoreEvaluationArtifact.id) : [];
  const receipt = {
    generated_at: generatedAt,
    mode: "production_shadow_canary",
    mutation_scope: "workflow/artifact/agent_invocation/approval_gate tables only",
    final_business_tables_mutated: false,
    workflow_run_id: workflow.workflowRun.id,
    workflow_status: workflow.status,
    video_id: videoId,
    call_id: callId,
    output_artifact_ids: workflow.outputArtifactIds,
    normalized_artifact_id: normalizedArtifact.id,
    score_evaluation_artifact_id: scoring?.scoreEvaluationArtifact.id ?? null,
    price_resolution_artifact_id: scoring?.priceResolutionArtifact.id ?? null,
    score: scoring?.evaluation.score ?? null,
    correct_direction: scoring?.evaluation.correctDirection ?? null,
    lineage_artifact_types: lineage.map((artifact) => artifact.artifact_type),
  };

  writeJsonFile(receiptPath, receipt);
  console.log(JSON.stringify({ ok: true, receipt_path: receiptPath, ...receipt }, null, 2));
  if (workflow.status !== "completed") process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
