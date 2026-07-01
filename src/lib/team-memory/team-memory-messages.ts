import { createHash } from "node:crypto";

export type TeamMemoryAgentMessageStatus = "queued" | "read" | "acked" | "closed" | "dead_lettered";

export interface BuildTeamMemoryAgentMessageInput {
  readonly fromAgent: string;
  readonly toAgent: string;
  readonly topic: string;
  readonly priority?: number;
  readonly summary: string;
  readonly actionRequested?: string | null;
  readonly refs?: readonly string[];
}

export interface TeamMemoryAgentMessage {
  readonly schema: "callscore.team_memory_agent_message.v1";
  readonly message_id: string;
  readonly from_agent: string;
  readonly to_agent: string;
  readonly topic: string;
  readonly priority: number;
  readonly summary: string;
  readonly action_requested: string | null;
  readonly refs: readonly string[];
  readonly status: "queued";
  readonly created_at: string;
  readonly updated_at: string;
}

export interface BuildTeamMemoryAgentMessageAckInput {
  readonly messageId: string;
  readonly ackingAgent: string;
  readonly status: Extract<TeamMemoryAgentMessageStatus, "acked" | "closed" | "dead_lettered">;
  readonly outcome: string;
  readonly refs?: readonly string[];
}

export interface TeamMemoryAgentMessageAck {
  readonly schema: "callscore.team_memory_agent_message_ack.v1";
  readonly message_id: string;
  readonly acking_agent: string;
  readonly status: Extract<TeamMemoryAgentMessageStatus, "acked" | "closed" | "dead_lettered">;
  readonly outcome: string;
  readonly refs: readonly string[];
  readonly created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
}

export function buildTeamMemoryAgentMessage(input: BuildTeamMemoryAgentMessageInput): TeamMemoryAgentMessage {
  const timestamp = nowIso();
  const refs = input.refs ?? [];
  return {
    schema: "callscore.team_memory_agent_message.v1",
    message_id: stableId("message", {
      from_agent: input.fromAgent,
      to_agent: input.toAgent,
      topic: input.topic,
      summary: input.summary,
      action_requested: input.actionRequested ?? null,
      refs,
    }),
    from_agent: input.fromAgent,
    to_agent: input.toAgent,
    topic: input.topic,
    priority: input.priority ?? 0,
    summary: input.summary,
    action_requested: input.actionRequested ?? null,
    refs,
    status: "queued",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function buildTeamMemoryAgentMessageAck(input: BuildTeamMemoryAgentMessageAckInput): TeamMemoryAgentMessageAck {
  return {
    schema: "callscore.team_memory_agent_message_ack.v1",
    message_id: input.messageId,
    acking_agent: input.ackingAgent,
    status: input.status,
    outcome: input.outcome,
    refs: input.refs ?? [],
    created_at: nowIso(),
  };
}
