import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { query } from "../lib/db";

const REPO_ROOT = process.cwd();
const SOULS_PATH = join(REPO_ROOT, "docs/ops/callscore-channel-head-souls.yaml");
const GTM_REGISTRY_PATH = join(REPO_ROOT, "docs/ops/callscore-gtm-agent-registry.json");
const RECEIPT_DIR = join(REPO_ROOT, ".tmp/workflow-receipts/agent_heartbeat");
const SOUL_VERSION = "callscore_channel_head_souls.v1";
const HEARTBEAT_SCHEMA = "callscore_agent_heartbeat.v1";
const LEASE_SECONDS = 2 * 60 * 60;
const WAKE_SECONDS = 60 * 60;

export const UPSERT_NEXT_CHANNEL_TASK_SQL = `
WITH existing_open AS (
  SELECT id
  FROM channel_tasks
  WHERE agent_id = $2
    AND task_type = $4
    AND status IN ('pending','running')
  ORDER BY updated_at DESC
  LIMIT 1
), inserted AS (
  INSERT INTO channel_tasks (
    id, agent_id, channel_id, task_type, status, priority, run_after, max_attempts,
    idempotency_key, payload_hash, payload
  )
  SELECT $1,$2,$3,$4,'pending',50,NOW(),1,$5,$6,$7::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM existing_open)
  ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
  RETURNING id
)
SELECT id, 'inserted' AS source FROM inserted
UNION ALL
SELECT id, 'existing_open' AS source FROM existing_open
LIMIT 1`;

type AgentSeed = {
  readonly agentId: string;
  readonly className: string;
  readonly ownerSurface: string;
  readonly cadence: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonb(value: unknown): string {
  return JSON.stringify(value);
}

function extractAgents(yaml: string): readonly AgentSeed[] {
  const agents: AgentSeed[] = [];
  const blocks = yaml.split(/\n(?=  - agent_id: )/g);
  for (const block of blocks) {
    const agentId = /agent_id:\s*([^\n]+)/.exec(block)?.[1]?.trim();
    if (!agentId) continue;
    const className = /\n\s*class:\s*([^\n]+)/.exec(block)?.[1]?.trim() ?? "channel_head";
    const ownerSurface = /\n\s*owner_surface:\s*([^\n]+)/.exec(block)?.[1]?.trim() ?? agentId;
    const cadence = /\n\s*cadence:\s*([^\n]+)/.exec(block)?.[1]?.trim() ?? "daily_plus_event_driven";
    agents.push({ agentId, className, ownerSurface, cadence });
  }
  if (agents.length === 0) throw new Error(`No agent_id entries found in ${SOULS_PATH}`);
  return agents;
}

function channelFor(agentId: string): string {
  if (agentId.includes("artofwar")) return "art_of_war";
  if (agentId.includes("x-linkedin")) return "owned_social";
  if (agentId.includes("community")) return "owned_community";
  if (agentId.includes("whop")) return "whop_commerce";
  if (agentId.includes("email")) return "email_partnership_drafts";
  if (agentId.includes("opportunity")) return "opportunity_research";
  if (agentId.includes("compliance")) return "compliance";
  if (agentId.includes("data-pipeline")) return "data_pipeline";
  return "general";
}

function defaultTaskType(agentId: string): string {
  if (agentId.includes("artofwar")) return "artofwar_campaign_dossier";
  if (agentId.includes("x-linkedin")) return "owned_social_draft_and_monitor";
  if (agentId.includes("community")) return "owned_community_draft_and_monitor";
  if (agentId.includes("whop")) return "whop_copy_asset_and_read_only_health";
  if (agentId.includes("email")) return "email_partnership_draft_packet_only";
  if (agentId.includes("opportunity")) return "opportunity_research_brief";
  if (agentId.includes("compliance")) return "compliance_lint_gate";
  if (agentId.includes("data-pipeline")) return "data_pipeline_freshness_sentinel";
  return "agent_observe";
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
  const nextWakeAt = new Date(now.getTime() + WAKE_SECONDS * 1000).toISOString();
  const souls = readFileSync(SOULS_PATH, "utf8");
  const registry = readFileSync(GTM_REGISTRY_PATH, "utf8");
  const agents = extractAgents(souls);
  const policyVersion = `sha256:${sha256(registry)}`;
  const soulHash = `sha256:${sha256(souls)}`;

  const receiptPath = join(RECEIPT_DIR, `agent-heartbeat-${nowIso.replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(receiptPath), { recursive: true });

  const heartbeatIds: string[] = [];
  const taskIds: string[] = [];
  const existingOpenTaskIds: string[] = [];

  for (const agent of agents) {
    const channelId = channelFor(agent.agentId);
    const displayName = agent.agentId.replace(/^callscore-/, "").replace(/-/g, " ");
    const metadata = {
      source: SOULS_PATH,
      soul_hash: soulHash,
      owner_surface: agent.ownerSurface,
      hermes_orchestrator: "default-profile",
      restricted_lanes_fail_closed: true,
    };
    await query(
      `INSERT INTO agent_instances (
         agent_id, display_name, class, owner_surface, status, autonomy_mode, current_mode,
         soul_version, policy_version, heartbeat_cadence, lease_seconds, metadata, updated_at
       ) VALUES ($1,$2,$3,$4,'active','full_autonomous_bounded','observe',$5,$6,$7,$8,$9::jsonb,NOW())
       ON CONFLICT (agent_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         class = EXCLUDED.class,
         owner_surface = EXCLUDED.owner_surface,
         status = 'active',
         autonomy_mode = 'full_autonomous_bounded',
         current_mode = 'observe',
         soul_version = EXCLUDED.soul_version,
         policy_version = EXCLUDED.policy_version,
         heartbeat_cadence = EXCLUDED.heartbeat_cadence,
         lease_seconds = EXCLUDED.lease_seconds,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [agent.agentId, displayName, agent.className, agent.ownerSurface, SOUL_VERSION, policyVersion, agent.cadence, LEASE_SECONDS, jsonb(metadata)],
    );

    const heartbeatId = `${agent.agentId}-${nowIso}`;
    const heartbeatPayload = {
      inputs_read: [SOULS_PATH, GTM_REGISTRY_PATH, "npm run workplane:status", "https://call-score.com"],
      decisions: ["agent_registered", "heartbeat_recorded", "restricted_lanes_fail_closed", "hermes_is_orchestrator"],
      actions_taken: ["upsert_agent_instance", "record_heartbeat", "upsert_next_channel_task"],
      receipts: [receiptPath],
      memory_delta: [],
      blockers: [],
      metrics: { lease_seconds: LEASE_SECONDS, channel_id: channelId },
    };
    await query(
      `INSERT INTO agent_heartbeats (
         id, heartbeat_id, agent_id, schema_version, mode, autonomy_mode, soul_version, policy_version,
         lease_expires_at, inputs_read, decisions, actions_taken, receipts, memory_delta, blockers, metrics,
         next_wake_at, stop_state
       ) VALUES ($1,$2,$3,$4,'observe','full_autonomous_bounded',$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,'continue')
       ON CONFLICT (heartbeat_id) DO NOTHING`,
      [
        randomUUID(), heartbeatId, agent.agentId, HEARTBEAT_SCHEMA, SOUL_VERSION, policyVersion, leaseExpiresAt,
        jsonb(heartbeatPayload.inputs_read), jsonb(heartbeatPayload.decisions), jsonb(heartbeatPayload.actions_taken),
        jsonb(heartbeatPayload.receipts), jsonb(heartbeatPayload.memory_delta), jsonb(heartbeatPayload.blockers),
        jsonb(heartbeatPayload.metrics), nextWakeAt,
      ],
    );
    heartbeatIds.push(heartbeatId);

    const taskType = defaultTaskType(agent.agentId);
    const taskKey = `${agent.agentId}:${taskType}:${nowIso.slice(0, 13)}`;
    const taskPayload = {
      agent_id: agent.agentId,
      channel_id: channelId,
      task_type: taskType,
      mode: agent.agentId.includes("email") ? "draft_only" : "observe_or_draft",
      hermes_orchestrator: "default-profile",
      allowed_external_mutation: false,
    };
    const payloadHash = `sha256:${sha256(JSON.stringify(taskPayload))}`;
    const [task] = await query<{ id: string; source: "inserted" | "existing_open" }>(
      UPSERT_NEXT_CHANNEL_TASK_SQL,
      [randomUUID(), agent.agentId, channelId, taskType, taskKey, payloadHash, jsonb(taskPayload)],
    );
    if (task?.id) {
      if (task.source === "existing_open") existingOpenTaskIds.push(task.id);
      else taskIds.push(task.id);
    }

    await query(
      `INSERT INTO autonomy_events (id, agent_id, event_type, detail)
       VALUES ($1,$2,'agent.heartbeat.recorded',$3::jsonb)`,
      [randomUUID(), agent.agentId, jsonb({ heartbeat_id: heartbeatId, task_type: taskType, channel_id: channelId, receipt: receiptPath })],
    );
  }

  const receipt = {
    receipt_id: `agent-heartbeat-${nowIso}`,
    created_at: nowIso,
    schema_version: "callscore_agent_heartbeat_receipt.v1",
    mode: "FULL_AUTONOMOUS_BOUNDED_OWNED_GTM",
    hermes_orchestrator: "default-profile",
    policy_version: policyVersion,
    soul_version: SOUL_VERSION,
    soul_hash: soulHash,
    agent_count: agents.length,
    heartbeat_count: heartbeatIds.length,
    task_count: taskIds.length + existingOpenTaskIds.length,
    new_task_count: taskIds.length,
    existing_open_task_count: existingOpenTaskIds.length,
    heartbeat_ids: heartbeatIds,
    task_ids: taskIds,
    existing_open_task_ids: existingOpenTaskIds,
    external_mutation_performed: false,
    restricted_lanes_fail_closed: true,
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    ok: true,
    receipt: receiptPath,
    agent_count: agents.length,
    heartbeat_count: heartbeatIds.length,
    task_count: taskIds.length + existingOpenTaskIds.length,
    new_task_count: taskIds.length,
    existing_open_task_count: existingOpenTaskIds.length,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
