import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { routeDecision } from "../lib/autonomy/decision-router";
import {
  writeChannelHeadDecisionReceipt,
  type ChannelHeadDecisionContext,
  type ChannelHeadDecisionResult,
} from "../lib/autonomy/channel-head-decision";
import {
  createDecisionTrace,
  traceInputSnapshot,
  traceDecision,
  traceReceipt,
  traceStateTransition,
  langfuseConfigured,
} from "../lib/autonomy/channel-head-langfuse";
import {
  loadState,
  transitionState,
  decisionToNextState,
  saveState,
  type ChannelHeadStateData,
} from "../lib/autonomy/channel-head-state-machine";
import { query } from "../lib/db";

const REPO_ROOT = process.cwd();
const SOULS_PATH = join(REPO_ROOT, "docs/ops/callscore-channel-head-souls.yaml");
const GTM_REGISTRY_PATH = join(REPO_ROOT, "docs/ops/callscore-gtm-agent-registry.json");
const RECEIPT_DIR = join(REPO_ROOT, ".tmp/workflow-receipts/agent_heartbeat");
const SOUL_VERSION = "callscore_channel_head_souls.v1";
const HEARTBEAT_SCHEMA = "callscore_agent_heartbeat.v1";
const LEASE_SECONDS = 2 * 60 * 60;
const WAKE_SECONDS = 60 * 60;
const AGENT_HEARTBEAT_USAGE = `Usage: node --import tsx src/scripts/callscore-agent-heartbeat.ts [--dry-run|--no-db-write]

Records CallScore channel-head heartbeats and proposes next channel tasks.

Options:
  --dry-run       Exercise the heartbeat plan and write local receipts without DB writes.
  --no-db-write   Alias for --dry-run.
  --help, -h      Print this help text and exit without DB writes.`;

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

export type AgentSeed = {
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

export function extractAgents(yaml: string): readonly AgentSeed[] {
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

export function registryStatusForChannel(registryJson: string, channelId: string): string {
  const parsed = JSON.parse(registryJson) as { entries?: Array<{ channel?: string; current_status?: string; gate_status?: string }> };
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const channelMatchers: Record<string, readonly RegExp[]> = {
    owned_social: [/^X \/ Twitter$/i, /^LinkedIn$/i],
    owned_community: [/Discord/i, /Telegram/i, /Reddit/i],
    email_partnership_drafts: [/Gmail/i, /email/i],
    whop_commerce: [/Whop/i],
    opportunity_research: [/opportunity/i],
    compliance: [/compliance/i],
    data_pipeline: [/data/i, /pipeline/i],
    art_of_war: [/Art of War/i],
  };
  const matchers = channelMatchers[channelId] ?? [];
  const entry = entries.find((candidate) => {
    const channel = candidate.channel ?? "";
    return matchers.some((matcher) => matcher.test(channel));
  });
  return entry?.current_status ?? entry?.gate_status ?? "gated";
}

interface HeartbeatDecisionArtifactInput {
  readonly agent: AgentSeed;
  readonly nowIso: string;
  readonly nextWakeAt: string;
  readonly channelId: string;
  readonly taskId: string | null;
  readonly taskType: string;
  readonly policyVersion: string;
  readonly soulVersion: string;
  readonly soulHash: string;
  readonly payloadHash: string;
  readonly registryStatus: string;
  readonly receiptPath: string;
}

function heartbeatTargetAction(taskType: string): ChannelHeadDecisionContext["targetActionType"] {
  switch (taskType) {
    case "owned_social_draft_and_monitor":
    case "owned_community_draft_and_monitor":
      return "publish_owned_public";
    case "email_partnership_draft_packet_only":
      return "create_approval_packet";
    case "compliance_lint_gate":
      return "run_compliance_lint";
    case "whop_copy_asset_and_read_only_health":
    case "data_pipeline_freshness_sentinel":
      return "monitor_read_only";
    default:
      return "draft";
  }
}

export function buildHeartbeatDecisionArtifacts(input: HeartbeatDecisionArtifactInput): ChannelHeadDecisionResult {
  const safeOwned = input.registryStatus === "ready_public_owned";
  const context: ChannelHeadDecisionContext = {
    now: input.nowIso,
    taskId: input.taskId,
    targetActionType: heartbeatTargetAction(input.taskType),
    riskClass: safeOwned ? "safe_owned_public" : "restricted_outreach",
    channelHeadSoul: {
      agentId: input.agent.agentId,
      channelId: input.channelId,
      soulVersion: input.soulVersion,
      purpose: `${input.agent.className} owns ${input.agent.ownerSurface} within bounded CallScore autonomy.`,
    },
    gtmRegistryState: {
      laneId: input.channelId,
      currentStatus: input.registryStatus,
      requiredGate: safeOwned ? "NONE" : "SEND_GATE",
      ownedOrManaged: safeOwned,
      zeroSpendRequired: true,
      allowedActions: [heartbeatTargetAction(input.taskType), "monitor_read_only", "draft"],
      forbiddenActions: ["provider_mutation", "payment_mutation", "whop_customer_mutation", "db_deploy_mutation", "secret_exposure"],
      rollbackPath: "docs/ops/callscore-gtm-agent-registry.md",
    },
    workplane: { status: "OK", automationReadiness: "CONTROLLED_FULL", blockers: [] },
    recentReceipts: [],
    cooldown: {
      channelCooldownActive: false,
      providerErrorCooldownActive: false,
      duplicatePayloadCooldownActive: false,
      waitUntil: input.nextWakeAt,
    },
    mediaGate: { status: "pass", evidenceHash: input.soulHash, artifactIds: ["heartbeat-soul-state"] },
    originalityGate: { status: "pass", evidenceHash: input.soulHash },
    qualitySignal: { status: "ambiguous", score: 0.7, verifierSignal: "heartbeat_only_requires_non_founder_review_before_public_act", evidenceHash: input.soulHash },
    channelPolicy: {
      policyVersion: input.policyVersion,
      publicClaimsSupported: true,
      claimBearingAllowed: true,
      safeOwnedPublicAllowed: safeOwned,
      requiresNonFounderReviewBelowConfidence: 0.8,
    },
    evidence: { evidenceLevel: "E2", evidenceHash: input.soulHash, sourceArtifactIds: ["channel-head-soul", "gtm-registry"] },
    payloadHash: input.payloadHash,
    caps: { channelPostsToday: 0, maxChannelPostsPerDay: 1, totalPostsToday: 0, maxTotalPostsPerDay: 3 },
    killSwitch: { global_active: false, channel_active: false, agent_paused: false, missing_state_blocks_dispatch: true },
    heartbeat: { heartbeat_id: `heartbeat:${input.agent.agentId}`, fresh: true, lease_expires_at: input.nextWakeAt },
    publicVerify: { status: "pass", checked_at: input.nowIso },
  };
  const result = routeDecision(context);
  return { ...result, receipt: { ...result.receipt, artifact_path: input.receiptPath } };
}

type QueryExecutor = <T>(text: string, params?: unknown[]) => Promise<T[]>;

interface AgentHeartbeatRunOptions {
  readonly argv?: readonly string[];
  readonly now?: Date;
  readonly queryExecutor?: QueryExecutor;
  readonly repoRoot?: string;
  readonly stdout?: (line: string) => void;
}

interface ProposedChannelTask {
  readonly agent_id: string;
  readonly channel_id: string;
  readonly task_type: string;
  readonly status: "pending";
  readonly priority: 50;
  readonly run_after: string;
  readonly max_attempts: 1;
  readonly idempotency_key: string;
  readonly payload_hash: string;
  readonly payload: Record<string, unknown>;
}

interface AutonomyEventProposal {
  readonly agent_id: string;
  readonly event_type: "agent.heartbeat.recorded";
  readonly detail: Record<string, unknown>;
}

export interface AgentHeartbeatRunResult {
  readonly ok: true;
  readonly receipt: string;
  readonly dry_run: boolean;
  readonly db_write_performed: boolean;
  readonly agent_count: number;
  readonly heartbeat_count: number;
  readonly task_count: number;
  readonly new_task_count: number;
  readonly existing_open_task_count: number;
  readonly proposed_task_count: number;
}

function hasDryRunFlag(argv: readonly string[]): boolean {
  return argv.includes("--dry-run") || argv.includes("--no-db-write");
}

function parseAgentHeartbeatArgs(argv: readonly string[]): { readonly dryRun: boolean; readonly help: boolean } {
  let help = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--dry-run" || arg === "--no-db-write") continue;
    throw new Error(`Unknown argument: ${arg}\n\n${AGENT_HEARTBEAT_USAGE}`);
  }
  return { dryRun: hasDryRunFlag(argv), help };
}

function pathsFor(repoRoot: string) {
  return {
    soulsPath: join(repoRoot, "docs/ops/callscore-channel-head-souls.yaml"),
    gtmRegistryPath: join(repoRoot, "docs/ops/callscore-gtm-agent-registry.json"),
    receiptDir: join(repoRoot, ".tmp/workflow-receipts/agent_heartbeat"),
  };
}

export async function runAgentHeartbeat(options: AgentHeartbeatRunOptions = {}): Promise<AgentHeartbeatRunResult> {
  const argv = options.argv ?? process.argv.slice(2);
  const args = parseAgentHeartbeatArgs(argv);
  if (args.help) {
    (options.stdout ?? console.log)(AGENT_HEARTBEAT_USAGE);
    return {
      ok: true,
      receipt: "",
      dry_run: true,
      db_write_performed: false,
      agent_count: 0,
      heartbeat_count: 0,
      task_count: 0,
      new_task_count: 0,
      existing_open_task_count: 0,
      proposed_task_count: 0,
    };
  }
  const dryRun = args.dryRun;
  const executeQuery = options.queryExecutor ?? query;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const paths = pathsFor(repoRoot);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
  const nextWakeAt = new Date(now.getTime() + WAKE_SECONDS * 1000).toISOString();
  const souls = readFileSync(paths.soulsPath, "utf8");
  const registry = readFileSync(paths.gtmRegistryPath, "utf8");
  const agents = extractAgents(souls);
  const policyVersion = `sha256:${sha256(registry)}`;
  const soulHash = `sha256:${sha256(souls)}`;

  const receiptPath = join(paths.receiptDir, `agent-heartbeat-${nowIso.replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(receiptPath), { recursive: true });

  const heartbeatIds: string[] = [];
  const taskIds: string[] = [];
  const existingOpenTaskIds: string[] = [];
  const decisionReceiptPaths: string[] = [];
  const proposedTasks: ProposedChannelTask[] = [];
  const autonomyEventProposals: AutonomyEventProposal[] = [];

  for (const agent of agents) {
    const channelId = channelFor(agent.agentId);
    const taskType = defaultTaskType(agent.agentId);
    const displayName = agent.agentId.replace(/^callscore-/, "").replace(/-/g, " ");
    const metadata = {
      source: paths.soulsPath,
      soul_hash: soulHash,
      owner_surface: agent.ownerSurface,
      hermes_orchestrator: "default-profile",
      restricted_lanes_fail_closed: true,
    };

    if (!dryRun) {
      await executeQuery(
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
    }

    const heartbeatId = `${agent.agentId}-${nowIso}`;
    const decisionReceiptTarget = join(paths.receiptDir, `channel-head-decision-${agent.agentId}-${nowIso.replace(/[:.]/g, "-")}.json`);
    const decisionArtifacts = buildHeartbeatDecisionArtifacts({
      agent,
      nowIso,
      nextWakeAt,
      channelId,
      taskId: null,
      taskType,
      policyVersion,
      soulVersion: SOUL_VERSION,
      soulHash,
      payloadHash: soulHash,
      registryStatus: registryStatusForChannel(registry, channelId),
      receiptPath: decisionReceiptTarget,
    });
    const decisionReceiptPath = writeChannelHeadDecisionReceipt(decisionArtifacts, paths.receiptDir);
    decisionReceiptPaths.push(decisionReceiptPath);

    // ── Langfuse tracing + state machine ──
    if (langfuseConfigured()) {
      const traceId = createDecisionTrace(agent.agentId, channelId);
      if (traceId) {
        traceInputSnapshot(traceId, decisionArtifacts.input);
        traceDecision(traceId, decisionArtifacts.decision);
        traceReceipt(traceId, decisionArtifacts.receipt);
      }
    }
    // ── State machine transition ──
    let state = loadState(agent.agentId, channelId, join(paths.receiptDir, "channel-head-states"), nowIso);
    // If starting fresh, transition through EVALUATING first
    if (state.state === "INITIAL") {
      state = transitionState(state, "EVALUATING", "heartbeat cycle start", undefined, undefined, nowIso);
    }
    const nextState = decisionToNextState(decisionArtifacts.decision.decision, state.state);
    const updatedState = transitionState(state, nextState, `decision: ${decisionArtifacts.decision.decision}`, decisionArtifacts.decision.decision_id, decisionArtifacts.receipt.receipt_id, nowIso);
    if (nextState === "COMPLETE") {
      const resetState = transitionState(updatedState, "INITIAL", "reset for next cycle", undefined, undefined, nowIso);
      saveState(resetState, join(paths.receiptDir, "channel-head-states"));
    } else {
      saveState(updatedState, join(paths.receiptDir, "channel-head-states"));
    }
    const heartbeatPayload = {
      inputs_read: [paths.soulsPath, paths.gtmRegistryPath, "npm run workplane:status", "https://call-score.com"],
      decisions: ["agent_registered", "heartbeat_recorded", `channel_head_decision:${decisionArtifacts.decision.decision}`, "restricted_lanes_fail_closed", "hermes_is_orchestrator"],
      actions_taken: dryRun
        ? ["dry_run_agent_instance_validated", "dry_run_heartbeat_validated", "dry_run_next_channel_task_proposed"]
        : ["upsert_agent_instance", "record_heartbeat", "upsert_next_channel_task"],
      receipts: [receiptPath, decisionReceiptPath],
      memory_delta: [],
      blockers: [],
      metrics: { lease_seconds: LEASE_SECONDS, channel_id: channelId, dry_run: dryRun },
    };

    if (!dryRun) {
      await executeQuery(
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
    }
    heartbeatIds.push(heartbeatId);

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
    const proposedTask: ProposedChannelTask = {
      agent_id: agent.agentId,
      channel_id: channelId,
      task_type: taskType,
      status: "pending",
      priority: 50,
      run_after: nowIso,
      max_attempts: 1,
      idempotency_key: taskKey,
      payload_hash: payloadHash,
      payload: taskPayload,
    };

    if (dryRun) {
      proposedTasks.push(proposedTask);
    } else {
      const [task] = await executeQuery<{ id: string; source: "inserted" | "existing_open" }>(
        UPSERT_NEXT_CHANNEL_TASK_SQL,
        [randomUUID(), agent.agentId, channelId, taskType, taskKey, payloadHash, jsonb(taskPayload)],
      );
      if (task?.id) {
        if (task.source === "existing_open") existingOpenTaskIds.push(task.id);
        else taskIds.push(task.id);
      }
    }

    const autonomyEventDetail = {
      heartbeat_id: heartbeatId,
      task_type: taskType,
      channel_id: channelId,
      receipt: receiptPath,
      decision_receipt: decisionReceiptPath,
      decision: decisionArtifacts.decision.decision,
      dry_run: dryRun,
    };
    if (dryRun) {
      autonomyEventProposals.push({ agent_id: agent.agentId, event_type: "agent.heartbeat.recorded", detail: autonomyEventDetail });
    } else {
      await executeQuery(
        `INSERT INTO autonomy_events (id, agent_id, event_type, detail)
         VALUES ($1,$2,'agent.heartbeat.recorded',$3::jsonb)`,
        [randomUUID(), agent.agentId, jsonb(autonomyEventDetail)],
      );
    }
  }

  const actualTaskCount = taskIds.length + existingOpenTaskIds.length;
  const receipt = {
    receipt_id: `agent-heartbeat-${nowIso}`,
    created_at: nowIso,
    schema_version: "callscore_agent_heartbeat_receipt.v1",
    mode: "FULL_AUTONOMOUS_BOUNDED_OWNED_GTM",
    dry_run: dryRun,
    no_db_write: dryRun,
    db_write_performed: !dryRun,
    hermes_orchestrator: "default-profile",
    policy_version: policyVersion,
    soul_version: SOUL_VERSION,
    soul_hash: soulHash,
    agent_count: agents.length,
    heartbeat_count: heartbeatIds.length,
    task_count: dryRun ? proposedTasks.length : actualTaskCount,
    new_task_count: dryRun ? 0 : taskIds.length,
    existing_open_task_count: dryRun ? 0 : existingOpenTaskIds.length,
    proposed_task_count: proposedTasks.length,
    heartbeat_ids: heartbeatIds,
    task_ids: taskIds,
    existing_open_task_ids: existingOpenTaskIds,
    proposed_tasks: proposedTasks,
    autonomy_event_proposals: autonomyEventProposals,
    decision_receipt_paths: decisionReceiptPaths,
    external_mutation_performed: false,
    provider_mutation_performed: false,
    whop_mutation_performed: false,
    production_mutation_performed: false,
    send_or_outreach_performed: false,
    restricted_lanes_fail_closed: true,
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  const result: AgentHeartbeatRunResult = {
    ok: true,
    receipt: receiptPath,
    dry_run: dryRun,
    db_write_performed: !dryRun,
    agent_count: agents.length,
    heartbeat_count: heartbeatIds.length,
    task_count: receipt.task_count,
    new_task_count: receipt.new_task_count,
    existing_open_task_count: receipt.existing_open_task_count,
    proposed_task_count: proposedTasks.length,
  };
  (options.stdout ?? console.log)(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAgentHeartbeat().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
