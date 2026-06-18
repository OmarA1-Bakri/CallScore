import type { ArtifactRecord, ControlPlaneRepository, JsonValue } from "../control-plane";
import { evaluateDirectionalScore, resolveDeterministicPrice, type PricePoint, type ScoreEvaluationResult } from "./deterministic";

export interface CreateScoreBoundaryArtifactsInput {
  readonly repository: ControlPlaneRepository;
  readonly workflowRunId: string;
  readonly nodeRunId?: string | null;
  readonly normalizedCallArtifactId: string;
  readonly callId: string;
  readonly marketSymbol: string;
  readonly direction: "bullish" | "bearish" | "neutral";
  readonly confidence: number;
  readonly callTimestamp: string;
  readonly horizonTimestamp: string;
  readonly candles: readonly PricePoint[];
}

export interface ScoreBoundaryArtifactsResult {
  readonly priceResolutionArtifact: ArtifactRecord;
  readonly scoreEvaluationArtifact: ArtifactRecord;
  readonly evaluation: ScoreEvaluationResult;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export async function createScoreBoundaryArtifacts(input: CreateScoreBoundaryArtifactsInput): Promise<ScoreBoundaryArtifactsResult> {
  const priceResolution = resolveDeterministicPrice({
    marketSymbol: input.marketSymbol,
    callTimestamp: input.callTimestamp,
    horizonTimestamp: input.horizonTimestamp,
    candles: input.candles,
  });
  const priceResolutionArtifact = await input.repository.createLinkedArtifact({
    workflowRunId: input.workflowRunId,
    nodeRunId: input.nodeRunId ?? null,
    artifactType: "price_resolution",
    schemaVersion: "callscore.price_resolution.v1",
    entityType: "market_call",
    entityId: input.callId,
    json: toJsonValue(priceResolution),
    parentArtifactIds: [input.normalizedCallArtifactId],
    linkType: "priced_by",
  });

  const evaluation = evaluateDirectionalScore({
    callId: input.callId,
    marketSymbol: input.marketSymbol,
    direction: input.direction,
    confidence: input.confidence,
    priceResolution,
  });
  const scoreEvaluationArtifact = await input.repository.createLinkedArtifact({
    workflowRunId: input.workflowRunId,
    nodeRunId: input.nodeRunId ?? null,
    artifactType: "score_evaluation",
    schemaVersion: "callscore.score_evaluation.v1",
    entityType: "market_call",
    entityId: input.callId,
    json: toJsonValue(evaluation),
    parentArtifactIds: [priceResolutionArtifact.id],
    linkType: "scored_by",
  });

  return { priceResolutionArtifact, scoreEvaluationArtifact, evaluation };
}
