-- CRYPTO-TUBER RANKED :: migration 024 :: agent autonomy ledger
-- Owner: CallScore Hermes/Workplane orchestration.
-- Purpose: Durable agent-level state for bounded autonomous channel heads.
-- Lifecycle: append-first heartbeats/events. External mutations remain receipt-gated.

CREATE TABLE IF NOT EXISTS agent_instances (
    agent_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    class TEXT NOT NULL,
    owner_surface TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'degraded', 'paused', 'disabled', 'draft_only', 'blocked')),
    autonomy_mode TEXT NOT NULL CHECK (autonomy_mode IN ('controlled_full', 'full_autonomous_bounded', 'draft_only', 'disabled')),
    current_mode TEXT NOT NULL CHECK (current_mode IN ('observe', 'draft', 'execute_owned', 'blocked', 'escalate', 'sleep')),
    soul_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    heartbeat_cadence TEXT NOT NULL,
    lease_seconds INTEGER NOT NULL CHECK (lease_seconds > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agent_instances IS 'Current durable identity and autonomy envelope for CallScore channel-head agents. Hermes/Workplane is the orchestrator of record.';

CREATE INDEX IF NOT EXISTS idx_agent_instances_status_updated
    ON agent_instances(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id UUID PRIMARY KEY,
    heartbeat_id TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL REFERENCES agent_instances(agent_id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('observe', 'draft', 'execute_owned', 'blocked', 'escalate', 'sleep')),
    autonomy_mode TEXT NOT NULL CHECK (autonomy_mode IN ('controlled_full', 'full_autonomous_bounded', 'draft_only', 'disabled')),
    soul_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    inputs_read JSONB NOT NULL DEFAULT '[]'::jsonb,
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    actions_taken JSONB NOT NULL DEFAULT '[]'::jsonb,
    receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
    memory_delta JSONB NOT NULL DEFAULT '[]'::jsonb,
    blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    next_wake_at TIMESTAMPTZ NOT NULL,
    stop_state TEXT NOT NULL CHECK (stop_state IN ('continue', 'sleep', 'blocked', 'escalated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agent_heartbeats IS 'Append-only heartbeat packets for autonomous channel-head liveness, decisions, receipts, and blockers.';

CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_agent_created
    ON agent_heartbeats(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_lease
    ON agent_heartbeats(agent_id, lease_expires_at DESC);

CREATE TABLE IF NOT EXISTS channel_tasks (
    id UUID PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agent_instances(agent_id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked', 'cancelled', 'draft_only')),
    priority INTEGER NOT NULL DEFAULT 0,
    run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    payload_hash TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    receipt_uri TEXT,
    blocker TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE channel_tasks IS 'Per-agent/channel task queue. External action tasks must have receipt and gate evidence before dispatch.';

CREATE INDEX IF NOT EXISTS idx_channel_tasks_status_run_after
    ON channel_tasks(status, run_after, priority DESC);

CREATE INDEX IF NOT EXISTS idx_channel_tasks_agent_status
    ON channel_tasks(agent_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS autonomy_events (
    id UUID PRIMARY KEY,
    agent_id TEXT REFERENCES agent_instances(agent_id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE autonomy_events IS 'Append-only event ledger for Hermes-orchestrated autonomous agent state transitions.';

CREATE INDEX IF NOT EXISTS idx_autonomy_events_agent_created
    ON autonomy_events(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autonomy_events_type_created
    ON autonomy_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_publications (
    id UUID PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agent_instances(agent_id) ON DELETE RESTRICT,
    channel_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    evidence_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('preflight', 'published', 'readback_verified', 'monitoring', 'rolled_back', 'blocked', 'failed')),
    external_id TEXT,
    url TEXT,
    rollback_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE channel_publications IS 'Autonomous owned-public publication ledger. No row here authorizes restricted sends/spend/provider mutations.';

CREATE INDEX IF NOT EXISTS idx_channel_publications_channel_created
    ON channel_publications(channel_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_publications_payload_channel
    ON channel_publications(channel_id, payload_hash);

CREATE TABLE IF NOT EXISTS approval_packets (
    id UUID PRIMARY KEY,
    agent_id TEXT REFERENCES agent_instances(agent_id) ON DELETE SET NULL,
    gate_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'requested', 'approved', 'rejected', 'expired', 'blocked')),
    payload_hash TEXT NOT NULL,
    rollback_path TEXT NOT NULL,
    exact_consent BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (NOT (exact_consent = TRUE AND approved_by IS NULL AND status = 'approved'))
);

COMMENT ON TABLE approval_packets IS 'Exact approval packet ledger for restricted autonomous lanes. Complements workflow approval_gates.';

CREATE INDEX IF NOT EXISTS idx_approval_packets_status_gate_created
    ON approval_packets(status, gate_type, created_at DESC);

CREATE TABLE IF NOT EXISTS experiment_memory (
    id UUID PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agent_instances(agent_id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL,
    memory_key TEXT NOT NULL,
    summary TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, memory_type, memory_key)
);

COMMENT ON TABLE experiment_memory IS 'Durable non-secret learning memory for channel-head experiments, hooks, blocked patterns, and campaign outcomes.';

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY,
    agent_id TEXT REFERENCES agent_instances(agent_id) ON DELETE SET NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL CHECK (status IN ('open', 'mitigated', 'resolved', 'cancelled')),
    incident_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

COMMENT ON TABLE incidents IS 'Autonomy incident ledger for policy blocks, provider failures, rollback events, and kill-switch actions.';

CREATE INDEX IF NOT EXISTS idx_incidents_status_severity_opened
    ON incidents(status, severity, opened_at DESC);
