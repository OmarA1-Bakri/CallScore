import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ControlPlaneRepository,
  type ArtifactLinkRecord,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type JsonRecord,
  type JsonValue,
  type WorkflowEventRecord,
} from "../src/lib/control-plane";
import { createScoreBoundaryArtifacts } from "../src/lib/scoring-boundary";
import { evaluateDirectionalScore, resolveDeterministicPrice } from "../src/lib/scoring-boundary/deterministic";

function now(): string { return "2026-06-18T00:00:00.000Z"; }

class ArtifactDb {
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly links: ArtifactLinkRecord[] = [];
  readonly events: WorkflowEventRecord[] = [];
  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("insert into artifacts")) {
      const row: ArtifactRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, artifact_type: String(params[3]), schema_version: String(params[4]), entity_type: params[5] as string | null, entity_id: params[6] as string | null, storage_uri: params[7] as string | null, json: params[8] as JsonValue | null, sha256: String(params[9]), created_at: now() };
      this.artifacts.set(row.id, row); return [row] as T[];
    }
    if (normalized.startsWith("insert into artifact_links")) {
      const row: ArtifactLinkRecord = { id: String(params[0]), workflow_run_id: String(params[1]), child_artifact_id: String(params[2]), parent_artifact_id: String(params[3]), link_type: params[4] as ArtifactLinkRecord["link_type"], metadata: params[5] as JsonRecord, created_at: now() };
      this.links.push(row); return [row] as T[];
    }
    if (normalized.startsWith("insert into workflow_events")) {
      const row: WorkflowEventRecord = { id: String(params[0]), workflow_run_id: String(params[1]), node_run_id: params[2] as string | null, event_type: params[3] as WorkflowEventRecord["event_type"], detail: params[4] as JsonRecord, created_at: now() };
      this.events.push(row); return [row] as T[];
    }
    throw new Error(`Unhandled SQL in scoring fake: ${normalized}`);
  };
}

test("deterministic price resolution uses nearest same-provider observations", () => {
  const result = resolveDeterministicPrice({
    marketSymbol: "BTCUSDT",
    callTimestamp: "2026-01-01T01:30:00.000Z",
    horizonTimestamp: "2026-01-31T00:30:00.000Z",
    candles: [
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-01T00:00:00.000Z", priceUsd: 100, provider: "fixture" },
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-31T00:00:00.000Z", priceUsd: 125, provider: "fixture" },
    ],
  });
  assert.equal(result.entry.priceUsd, 100);
  assert.equal(result.horizon.priceUsd, 125);
  assert.equal(result.method, "nearest_observation");
});

test("directional score boundary is deterministic and never writes calls directly", async () => {
  const db = new ArtifactDb();
  const repository = new ControlPlaneRepository(db.execute);
  const normalized = await repository.createArtifact({
    id: "00000000-0000-4000-8000-000000000301",
    workflowRunId: "00000000-0000-4000-8000-000000000101",
    nodeRunId: "00000000-0000-4000-8000-000000000102",
    artifactType: "normalized_calls",
    schemaVersion: "callscore.normalized_calls.v1",
    entityType: "market_call",
    entityId: "call-1",
    json: { calls: [{ marketSymbol: "BTCUSDT" }] },
  });

  const result = await createScoreBoundaryArtifacts({
    repository,
    workflowRunId: normalized.workflow_run_id,
    nodeRunId: normalized.node_run_id,
    normalizedCallArtifactId: normalized.id,
    callId: "call-1",
    marketSymbol: "BTCUSDT",
    direction: "bullish",
    confidence: 0.8,
    callTimestamp: "2026-01-01T00:00:00.000Z",
    horizonTimestamp: "2026-01-31T00:00:00.000Z",
    candles: [
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-01T00:00:00.000Z", priceUsd: 100, provider: "fixture" },
      { marketSymbol: "BTCUSDT", observedAt: "2026-01-31T00:00:00.000Z", priceUsd: 125, provider: "fixture" },
    ],
  });

  assert.equal(result.priceResolutionArtifact.artifact_type, "price_resolution");
  assert.equal(result.scoreEvaluationArtifact.artifact_type, "score_evaluation");
  assert.equal(result.evaluation.returnPct, 25);
  assert.equal(result.evaluation.correctDirection, true);
  assert.equal(result.evaluation.score, 20);
  assert.deepEqual(db.links.map((link) => link.link_type), ["priced_by", "scored_by"]);
});

test("scoring boundary source does not mutate final business tables", () => {
  const root = join(__dirname, "..");
  const source = readFileSync(join(root, "src/lib/scoring-boundary/index.ts"), "utf8");
  assert.doesNotMatch(source, /insert\s+into\s+calls/i);
  assert.doesNotMatch(source, /update\s+calls/i);
  assert.doesNotMatch(source, /creator_stats/i);
});

test("directional scoring handles bearish calls deterministically", () => {
  const priceResolution = resolveDeterministicPrice({
    marketSymbol: "SOLUSDT",
    callTimestamp: "2026-01-01T00:00:00.000Z",
    horizonTimestamp: "2026-01-31T00:00:00.000Z",
    candles: [
      { marketSymbol: "SOLUSDT", observedAt: "2026-01-01T00:00:00.000Z", priceUsd: 200, provider: "fixture" },
      { marketSymbol: "SOLUSDT", observedAt: "2026-01-31T00:00:00.000Z", priceUsd: 150, provider: "fixture" },
    ],
  });
  const evaluation = evaluateDirectionalScore({ callId: "call-2", marketSymbol: "SOLUSDT", direction: "bearish", confidence: 1, priceResolution });
  assert.equal(evaluation.returnPct, -25);
  assert.equal(evaluation.correctDirection, true);
  assert.equal(evaluation.score, 25);
});
