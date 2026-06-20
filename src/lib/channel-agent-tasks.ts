import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { query } from "./db";
import type { PipelineJob } from "./pipeline";
import { runWorkplaneJob, type WorkplaneJobType } from "./workplane-jobs";

export const CHANNEL_AGENT_TASK_TYPES = [
  "artofwar_campaign_dossier",
  "owned_social_draft_and_monitor",
  "owned_community_draft_and_monitor",
  "whop_copy_asset_and_read_only_health",
  "email_partnership_draft_packet_only",
  "opportunity_research_brief",
  "compliance_lint_gate",
  "data_pipeline_freshness_sentinel",
] as const;

export type ChannelAgentTaskType = (typeof CHANNEL_AGENT_TASK_TYPES)[number];

export interface ChannelAgentTask {
  readonly id: string;
  readonly agent_id: string;
  readonly channel_id: string;
  readonly task_type: string;
  readonly status: "pending" | "running" | "succeeded" | "failed" | "blocked" | "cancelled" | "draft_only";
  readonly priority: number;
  readonly run_after: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly idempotency_key: string;
  readonly payload_hash: string | null;
  readonly payload: Record<string, unknown>;
  readonly receipt_uri: string | null;
  readonly blocker: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ClaimNextChannelTaskInput {
  readonly workerId: string;
  readonly types: readonly string[];
}

const RECEIPT_DIR = ".tmp/workflow-receipts/channel_agent_tasks";
const CHANNEL_TASK_SYNTHETIC_RUN_ID = -1;

export const CLAIM_NEXT_CHANNEL_TASK_SQL = `
WITH next_task AS (
  SELECT id
  FROM channel_tasks
  WHERE status = 'pending'
    AND run_after <= NOW()
    AND attempts < max_attempts
    AND task_type = ANY($1::text[])
  ORDER BY priority DESC, run_after ASC, created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE channel_tasks
SET status = 'running',
    attempts = attempts + 1,
    updated_at = NOW(),
    blocker = NULL
WHERE id = (SELECT id FROM next_task)
RETURNING *`;

function readPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

function normalizeTask(row: ChannelAgentTask): ChannelAgentTask {
  return { ...row, payload: readPayload(row.payload) };
}

function hashToPositiveInt(value: string): number {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16) % 2_000_000_000;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function isChannelAgentTaskType(value: string): value is ChannelAgentTaskType {
  return (CHANNEL_AGENT_TASK_TYPES as readonly string[]).includes(value);
}

export function channelTaskWorkplaneJobType(taskType: string): WorkplaneJobType {
  switch (taskType) {
    case "artofwar_campaign_dossier":
      return "artofwar_campaign_dossier";
    case "owned_social_draft_and_monitor":
      return "artofwar_content_queue_dry_run";
    case "owned_community_draft_and_monitor":
      return "artofwar_audience_research_dry_run";
    case "whop_copy_asset_and_read_only_health":
      return "whop_provider_health";
    case "email_partnership_draft_packet_only":
      return "artofwar_outreach_queue_prepare";
    case "opportunity_research_brief":
      return "artofwar_strategy_brief";
    case "compliance_lint_gate":
      return "artofwar_publish_approval_review";
    case "data_pipeline_freshness_sentinel":
      return "automation_health_check";
    default:
      throw new Error(`Unsupported channel agent task type: ${taskType}`);
  }
}

export async function claimNextChannelTask(input: ClaimNextChannelTaskInput): Promise<ChannelAgentTask | null> {
  const [task] = await query<ChannelAgentTask>(CLAIM_NEXT_CHANNEL_TASK_SQL, [[...input.types]]);
  if (!task) return null;
  await query(
    `INSERT INTO autonomy_events (id, agent_id, event_type, detail)
     VALUES ($1,$2,'channel_task.claimed',$3::jsonb)`,
    [randomUUID(), task.agent_id, JSON.stringify({ task_id: task.id, worker_id: input.workerId, task_type: task.task_type, channel_id: task.channel_id })],
  );
  return normalizeTask(task);
}

function syntheticPipelineJobForChannelTask(task: ChannelAgentTask, workerId: string): PipelineJob {
  const jobType = channelTaskWorkplaneJobType(task.task_type);
  return {
    id: hashToPositiveInt(task.id),
    run_id: CHANNEL_TASK_SYNTHETIC_RUN_ID,
    type: jobType,
    status: "running",
    priority: task.priority,
    payload: {
      ...task.payload,
      source: "channel_tasks",
      channel_task_id: task.id,
      channel_task_type: task.task_type,
      agent_id: task.agent_id,
      channel_id: task.channel_id,
      run_id: `channel-task-${task.id}`,
      allowed_external_mutation: false,
      external_mutation_performed: false,
      hermes_orchestrator: "default-profile",
    },
    attempts: task.attempts,
    max_attempts: task.max_attempts,
    locked_by: workerId,
    locked_at: nowIso(),
    heartbeat_at: nowIso(),
    lease_expires_at: null,
    run_after: task.run_after,
    idempotency_key: task.idempotency_key,
    error: null,
    metrics: {},
    phase: "phase5-marketing",
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

export function summarizeChannelTaskResult(task: ChannelAgentTask, result: Record<string, unknown>): Record<string, unknown> {
  return {
    agent_id: task.agent_id,
    channel_id: task.channel_id,
    task_id: task.id,
    task_type: task.task_type,
    attempts: task.attempts,
    workplane_job_type: channelTaskWorkplaneJobType(task.task_type),
    receipt: typeof result.receipt === "string" ? result.receipt : result.receipt_path,
    workplane_receipt_path: result.receipt_path,
    artifact_path: result.out,
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    public_action_performed: false,
    decision: result.decision ?? result.mode ?? "report_only_no_external_mutation",
  };
}

function writeChannelTaskReceipt(task: ChannelAgentTask, workerId: string, result: Record<string, unknown>): string {
  const createdAt = nowIso();
  const path = join(RECEIPT_DIR, `${createdAt.replace(/[:.]/g, "-")}-${task.agent_id}-${task.id}.json`);
  const receipt = {
    schema_version: "callscore_channel_agent_task_execution_receipt.v1",
    created_at: createdAt,
    worker_id: workerId,
    task,
    result: summarizeChannelTaskResult(task, result),
    raw_result: result,
    independent_agent_execution: true,
    hermes_orchestrator_role: "supervise_and_verify_not_manual_task_execution",
    restricted_lanes_fail_closed: true,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return path;
}

export async function completeChannelTask(task: ChannelAgentTask, receiptPath: string): Promise<void> {
  await query(
    `UPDATE channel_tasks
     SET status = 'succeeded', receipt_uri = $2, updated_at = NOW(), blocker = NULL
     WHERE id = $1`,
    [task.id, receiptPath],
  );
  await query(
    `INSERT INTO autonomy_events (id, agent_id, event_type, detail)
     VALUES ($1,$2,'channel_task.completed',$3::jsonb)`,
    [randomUUID(), task.agent_id, JSON.stringify({ task_id: task.id, task_type: task.task_type, channel_id: task.channel_id, receipt: receiptPath })],
  );
}

export async function failChannelTask(task: ChannelAgentTask, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await query(
    `UPDATE channel_tasks
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         blocker = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [task.id, message],
  );
  await query(
    `INSERT INTO autonomy_events (id, agent_id, event_type, detail)
     VALUES ($1,$2,'channel_task.failed',$3::jsonb)`,
    [randomUUID(), task.agent_id, JSON.stringify({ task_id: task.id, task_type: task.task_type, channel_id: task.channel_id, error: message })],
  );
}

export async function runChannelTask(task: ChannelAgentTask, workerId: string): Promise<Record<string, unknown>> {
  if (!isChannelAgentTaskType(task.task_type)) throw new Error(`Unsupported channel agent task type: ${task.task_type}`);
  const workplaneResult = await runWorkplaneJob(syntheticPipelineJobForChannelTask(task, workerId));
  const receipt = writeChannelTaskReceipt(task, workerId, workplaneResult);
  await completeChannelTask(task, receipt);
  return { ...summarizeChannelTaskResult(task, { ...workplaneResult, receipt }), receipt };
}
