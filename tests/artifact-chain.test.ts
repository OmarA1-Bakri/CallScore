import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARTIFACT_LINK_TYPES,
  CONTROL_PLANE_ARTIFACT_TYPES,
  ControlPlaneRepository,
  checksumArtifact,
  type ArtifactLinkRecord,
  type ArtifactLineageRecord,
  type ArtifactRecord,
  type ControlPlaneQueryExecutor,
  type JsonRecord,
  type JsonValue,
  type WorkflowEventRecord,
} from "../src/lib/control-plane";

const root = join(__dirname, "..");

function now(): string {
  return "2026-06-18T00:00:00.000Z";
}

class ArtifactChainDb {
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly links: ArtifactLinkRecord[] = [];
  readonly events: WorkflowEventRecord[] = [];

  readonly execute: ControlPlaneQueryExecutor = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> => {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into artifacts")) {
      const row: ArtifactRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_run_id: params[2] as string | null,
        artifact_type: String(params[3]),
        schema_version: String(params[4]),
        entity_type: params[5] as string | null,
        entity_id: params[6] as string | null,
        storage_uri: params[7] as string | null,
        json: params[8] as JsonValue | null,
        sha256: String(params[9]),
        created_at: now(),
      };
      this.artifacts.set(row.id, row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into workflow_events")) {
      const row: WorkflowEventRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        node_run_id: params[2] as string | null,
        event_type: params[3] as WorkflowEventRecord["event_type"],
        detail: params[4] as JsonRecord,
        created_at: now(),
      };
      this.events.push(row);
      return [row] as T[];
    }

    if (normalized.startsWith("insert into artifact_links")) {
      const row: ArtifactLinkRecord = {
        id: String(params[0]),
        workflow_run_id: String(params[1]),
        child_artifact_id: String(params[2]),
        parent_artifact_id: String(params[3]),
        link_type: params[4] as ArtifactLinkRecord["link_type"],
        metadata: params[5] as JsonRecord,
        created_at: now(),
      };
      this.links.push(row);
      return [row] as T[];
    }

    if (normalized.includes("from artifacts") && normalized.includes("recursive artifact_lineage")) {
      const rootArtifactId = String(params[0]);
      const rows: ArtifactLineageRecord[] = [];
      const visit = (artifactId: string, depth: number, path: string[]) => {
        const artifact = this.artifacts.get(artifactId);
        if (!artifact) return;
        rows.push({ ...artifact, depth, path });
        for (const link of this.links.filter((candidate) => candidate.child_artifact_id === artifactId)) {
          if (!path.includes(link.parent_artifact_id)) visit(link.parent_artifact_id, depth + 1, [...path, link.parent_artifact_id]);
        }
      };
      visit(rootArtifactId, 0, [rootArtifactId]);
      return rows.sort((a, b) => a.depth - b.depth || a.created_at.localeCompare(b.created_at)) as T[];
    }

    throw new Error(`Unhandled SQL in artifact chain fake: ${normalized}`);
  };
}

test("artifact type constants cover the required CallScore chain", () => {
  assert.deepEqual(CONTROL_PLANE_ARTIFACT_TYPES, [
    "video_metadata",
    "transcript_raw",
    "transcript_segments",
    "candidate_calls",
    "normalized_calls",
    "validation_report",
    "price_resolution",
    "score_evaluation",
    "publication_decision",
  ]);
  assert.ok(ARTIFACT_LINK_TYPES.includes("derived_from"));
  assert.ok(ARTIFACT_LINK_TYPES.includes("evidence_for"));
});

test("linked artifacts preserve score-to-transcript lineage and deterministic checksums", async () => {
  const db = new ArtifactChainDb();
  const repo = new ControlPlaneRepository(db.execute);
  const workflowRunId = "00000000-0000-4000-8000-000000000101";
  const nodeRunId = "00000000-0000-4000-8000-000000000102";

  const video = await repo.createArtifact({
    id: "00000000-0000-4000-8000-000000000201",
    workflowRunId,
    nodeRunId,
    artifactType: "video_metadata",
    schemaVersion: "callscore.video_metadata.v1",
    entityType: "video",
    entityId: "video-1",
    json: { video_id: "video-1", title: "BTC thesis" },
  });
  const transcript = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000202",
    workflowRunId,
    nodeRunId,
    artifactType: "transcript_raw",
    schemaVersion: "callscore.transcript_raw.v1",
    entityType: "video",
    entityId: "video-1",
    json: { text: "BTC breaks out above resistance." },
    parentArtifactIds: [video.id],
  });
  const segments = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000203",
    workflowRunId,
    nodeRunId,
    artifactType: "transcript_segments",
    schemaVersion: "callscore.transcript_segments.v1",
    entityType: "video",
    entityId: "video-1",
    json: { segments: [{ id: "seg-1", quote: "BTC breaks out above resistance." }] },
    parentArtifactIds: [transcript.id],
  });
  const candidate = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000204",
    workflowRunId,
    nodeRunId,
    artifactType: "candidate_calls",
    schemaVersion: "callscore.candidate_calls.v1",
    entityType: "video",
    entityId: "video-1",
    json: { calls: [{ asset_symbol: "BTC", raw_claim: "BTC breaks out", evidence_segment_id: "seg-1" }] },
    parentArtifactIds: [segments.id],
  });
  const normalized = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000205",
    workflowRunId,
    nodeRunId,
    artifactType: "normalized_calls",
    schemaVersion: "callscore.normalized_calls.v1",
    entityType: "market_call",
    entityId: "call-1",
    json: { calls: [{ asset_symbol: "BTCUSDT", direction: "bullish" }] },
    parentArtifactIds: [candidate.id],
  });
  const validation = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000206",
    workflowRunId,
    nodeRunId,
    artifactType: "validation_report",
    schemaVersion: "callscore.validation_report.v1",
    entityType: "market_call",
    entityId: "call-1",
    json: { valid: true },
    parentArtifactIds: [normalized.id],
  });
  const price = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000207",
    workflowRunId,
    nodeRunId,
    artifactType: "price_resolution",
    schemaVersion: "callscore.price_resolution.v1",
    entityType: "market_call",
    entityId: "call-1",
    json: { provider: "fixture", entry_price: 100 },
    parentArtifactIds: [validation.id],
  });
  const score = await repo.createLinkedArtifact({
    id: "00000000-0000-4000-8000-000000000208",
    workflowRunId,
    nodeRunId,
    artifactType: "score_evaluation",
    schemaVersion: "callscore.score_evaluation.v1",
    entityType: "market_call",
    entityId: "call-1",
    json: { score: 0.42 },
    parentArtifactIds: [price.id],
  });

  assert.equal(db.links.length, 7);
  assert.equal(score.sha256, checksumArtifact({
    artifactType: "score_evaluation",
    schemaVersion: "callscore.score_evaluation.v1",
    entityType: "market_call",
    entityId: "call-1",
    json: { score: 0.42 },
  }));

  const lineage = await repo.listArtifactLineage(score.id);
  assert.deepEqual(lineage.map((artifact) => artifact.artifact_type), [
    "score_evaluation",
    "price_resolution",
    "validation_report",
    "normalized_calls",
    "candidate_calls",
    "transcript_segments",
    "transcript_raw",
    "video_metadata",
  ]);
  assert.deepEqual(lineage.map((artifact) => artifact.depth), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("artifact-chain migration adds parent link table and indexes without mutating core business tables", () => {
  const migration = readFileSync(join(root, "migrations/023-artifact-chain.sql"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS artifact_links/i);
  assert.match(migration, /child_artifact_id UUID NOT NULL REFERENCES artifacts\(id\)/i);
  assert.match(migration, /parent_artifact_id UUID NOT NULL REFERENCES artifacts\(id\)/i);
  assert.match(migration, /link_type TEXT NOT NULL CHECK/i);
  assert.match(migration, /UNIQUE \(child_artifact_id, parent_artifact_id, link_type\)/i);
  assert.doesNotMatch(migration, /ALTER TABLE calls/i);
  assert.doesNotMatch(migration, /ALTER TABLE creator_stats/i);
});
