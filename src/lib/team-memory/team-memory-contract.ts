import { createHash } from "node:crypto";

export const TEAM_MEMORY_SQLITE_PATH = "/srv/agents/hermes/runtime/callscore-team-memory/team-memory.sqlite";
export const TEAM_MEMORY_ARTIFACT_ROOT = "/srv/agents/hermes/runtime/callscore-team-memory/artifacts";

export const TEAM_MEMORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS team_memory_assets (
  asset_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  producing_agent TEXT NOT NULL,
  channel TEXT,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS team_memory_receipts (
  receipt_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  receipt_type TEXT NOT NULL,
  receipt_path TEXT NOT NULL,
  producing_agent TEXT NOT NULL,
  channel TEXT,
  decision TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS team_memory_learning_events (
  learning_event_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_agent TEXT NOT NULL,
  channels_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS team_memory_agent_messages (
  message_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  topic TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  action_requested TEXT,
  refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_memory_agent_message_acks (
  ack_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  message_id TEXT NOT NULL,
  acking_agent TEXT NOT NULL,
  status TEXT NOT NULL,
  outcome TEXT NOT NULL,
  refs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_memory_assets_channel ON team_memory_assets(channel);
CREATE INDEX IF NOT EXISTS idx_team_memory_receipts_type ON team_memory_receipts(receipt_type);
CREATE INDEX IF NOT EXISTS idx_team_memory_learning_event_type ON team_memory_learning_events(event_type);
CREATE INDEX IF NOT EXISTS idx_team_memory_messages_to_status ON team_memory_agent_messages(to_agent, status);
CREATE INDEX IF NOT EXISTS idx_team_memory_message_acks_message ON team_memory_agent_message_acks(message_id);
`;

export interface BuildTeamMemoryArtifactRefInput {
  readonly artifactPath: string;
  readonly artifactType: string;
  readonly producingAgent: string;
  readonly channel?: string | null;
  readonly content: string | Buffer;
  readonly metadata?: Record<string, unknown>;
}

export interface TeamMemoryArtifactRef {
  readonly schema: "callscore.team_memory_artifact_ref.v1";
  readonly asset_id: string;
  readonly artifact_type: string;
  readonly artifact_path: string;
  readonly producing_agent: string;
  readonly channel: string | null;
  readonly sha256: `sha256:${string}`;
  readonly created_at: string;
  readonly metadata: Record<string, unknown>;
}

export interface BuildTeamMemoryReceiptRecordInput {
  readonly receiptType: string;
  readonly receiptPath: string;
  readonly producingAgent: string;
  readonly channel?: string | null;
  readonly decision: string;
  readonly artifactRefs?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface TeamMemoryReceiptRecord {
  readonly schema: "callscore.team_memory_receipt_record.v1";
  readonly receipt_id: string;
  readonly receipt_type: string;
  readonly receipt_path: string;
  readonly producing_agent: string;
  readonly channel: string | null;
  readonly decision: string;
  readonly artifact_refs: readonly string[];
  readonly created_at: string;
  readonly metadata: Record<string, unknown>;
}

export interface BuildTeamMemoryLearningEventRecordInput {
  readonly eventType: string;
  readonly sourceAgent: string;
  readonly channels?: readonly string[];
  readonly summary: string;
  readonly evidenceRefs?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface TeamMemoryLearningEventRecord {
  readonly schema: "callscore.team_memory_learning_event_record.v1";
  readonly learning_event_id: string;
  readonly event_type: string;
  readonly source_agent: string;
  readonly channels: readonly string[];
  readonly summary: string;
  readonly evidence_refs: readonly string[];
  readonly created_at: string;
  readonly metadata: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}

export function buildTeamMemoryArtifactRef(input: BuildTeamMemoryArtifactRefInput): TeamMemoryArtifactRef {
  const digest = sha256(input.content);
  return {
    schema: "callscore.team_memory_artifact_ref.v1",
    asset_id: stableId("asset", {
      artifact_path: input.artifactPath,
      artifact_type: input.artifactType,
      producing_agent: input.producingAgent,
      channel: input.channel ?? null,
      sha256: digest,
    }),
    artifact_type: input.artifactType,
    artifact_path: input.artifactPath,
    producing_agent: input.producingAgent,
    channel: input.channel ?? null,
    sha256: digest,
    created_at: nowIso(),
    metadata: input.metadata ?? {},
  };
}

export function buildTeamMemoryReceiptRecord(input: BuildTeamMemoryReceiptRecordInput): TeamMemoryReceiptRecord {
  return {
    schema: "callscore.team_memory_receipt_record.v1",
    receipt_id: stableId("receipt", {
      receipt_type: input.receiptType,
      receipt_path: input.receiptPath,
      producing_agent: input.producingAgent,
      channel: input.channel ?? null,
      decision: input.decision,
    }),
    receipt_type: input.receiptType,
    receipt_path: input.receiptPath,
    producing_agent: input.producingAgent,
    channel: input.channel ?? null,
    decision: input.decision,
    artifact_refs: input.artifactRefs ?? [],
    created_at: nowIso(),
    metadata: input.metadata ?? {},
  };
}

export function buildTeamMemoryLearningEventRecord(
  input: BuildTeamMemoryLearningEventRecordInput,
): TeamMemoryLearningEventRecord {
  return {
    schema: "callscore.team_memory_learning_event_record.v1",
    learning_event_id: stableId("learning", {
      event_type: input.eventType,
      source_agent: input.sourceAgent,
      channels: input.channels ?? [],
      summary: input.summary,
      evidence_refs: input.evidenceRefs ?? [],
    }),
    event_type: input.eventType,
    source_agent: input.sourceAgent,
    channels: input.channels ?? [],
    summary: input.summary,
    evidence_refs: input.evidenceRefs ?? [],
    created_at: nowIso(),
    metadata: input.metadata ?? {},
  };
}
