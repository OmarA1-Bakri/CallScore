-- CRYPTO-TUBER RANKED :: migration 022 :: workflow control plane
-- Owner: CallScore control plane.
-- Purpose: Durable semantic workflow ledger layered on top of the existing
-- pipeline_runs/pipeline_jobs substrate. The existing pipeline tables remain
-- the operational queue; these tables provide replayable workflow, node,
-- artifact, agent invocation, and approval-gate audit records.
-- Lifecycle: append-first audit data. Historical rows should not be deleted
-- except under an explicit future retention policy approved by the operator.

CREATE TABLE IF NOT EXISTS workflow_runs (
    id UUID PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval', 'cancelled', 'blocked')
    ),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    triggered_by TEXT,
    total_input_tokens INTEGER CHECK (total_input_tokens IS NULL OR total_input_tokens >= 0),
    total_output_tokens INTEGER CHECK (total_output_tokens IS NULL OR total_output_tokens >= 0),
    total_cost_usd NUMERIC CHECK (total_cost_usd IS NULL OR total_cost_usd >= 0),
    pipeline_run_id BIGINT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflow_runs IS 'CallScore control-plane workflow ledger. Bridges to pipeline_runs without replacing the existing queue substrate.';
COMMENT ON COLUMN workflow_runs.pipeline_run_id IS 'Optional bridge to legacy/current pipeline_runs row when a workflow is executed by the existing worker substrate.';

CREATE INDEX IF NOT EXISTS idx_workflow_runs_name_status_created
    ON workflow_runs(workflow_name, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_entity_created
    ON workflow_runs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_pipeline_run
    ON workflow_runs(pipeline_run_id)
    WHERE pipeline_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_node_runs (
    id UUID PRIMARY KEY,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (
        node_type IN ('deterministic', 'llm_structured', 'parallel_review', 'approval', 'delay_until', 'cancel')
    ),
    role TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval', 'cancelled', 'blocked')
    ),
    parent_node_run_id UUID REFERENCES workflow_node_runs(id) ON DELETE SET NULL,
    model TEXT,
    prompt_version TEXT,
    input_artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    output_artifact_id UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    pipeline_job_id BIGINT REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workflow_run_id, node_id)
);

COMMENT ON TABLE workflow_node_runs IS 'Per-node execution ledger for CallScore workflows. Nodes are semantic execution steps, not replacement queue jobs.';
COMMENT ON COLUMN workflow_node_runs.pipeline_job_id IS 'Optional bridge to pipeline_jobs when an existing worker job executes this semantic node.';

CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_workflow_status
    ON workflow_node_runs(workflow_run_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_node_runs_pipeline_job
    ON workflow_node_runs(pipeline_job_id)
    WHERE pipeline_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_events (
    id UUID PRIMARY KEY,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_run_id UUID REFERENCES workflow_node_runs(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'workflow.started',
            'workflow.completed',
            'workflow.failed',
            'node.started',
            'node.completed',
            'node.failed',
            'artifact.created',
            'agent_invocation.started',
            'agent_invocation.completed',
            'agent_invocation.failed',
            'approval.requested',
            'approval.approved',
            'approval.rejected',
            'gate.blocked'
        )
    ),
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflow_events IS 'Append-only event stream for workflow and node lifecycle, artifact creation, agent invocation, and approval-gate actions.';

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_created
    ON workflow_events(workflow_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_node_created
    ON workflow_events(node_run_id, created_at DESC)
    WHERE node_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_events_type_created
    ON workflow_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_run_id UUID REFERENCES workflow_node_runs(id) ON DELETE SET NULL,
    artifact_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    storage_uri TEXT,
    json JSONB,
    sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (json IS NOT NULL OR storage_uri IS NOT NULL),
    CHECK (sha256 ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE artifacts IS 'Immutable control-plane artifacts. Corrections should create a new artifact/version rather than mutating historical rows.';
COMMENT ON COLUMN artifacts.sha256 IS 'SHA-256 checksum over canonical artifact content and metadata, generated by repository code.';

CREATE INDEX IF NOT EXISTS idx_artifacts_workflow_created
    ON artifacts(workflow_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_node_created
    ON artifacts(node_run_id, created_at DESC)
    WHERE node_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artifacts_type_created
    ON artifacts(artifact_type, schema_version, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifacts_entity_created
    ON artifacts(entity_type, entity_id, created_at DESC)
    WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_invocations (
    id UUID PRIMARY KEY,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_run_id UUID NOT NULL REFERENCES workflow_node_runs(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    prompt_version TEXT,
    input_artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    output_artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
    cost_usd NUMERIC CHECK (cost_usd IS NULL OR cost_usd >= 0),
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval', 'cancelled', 'blocked')
    ),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agent_invocations IS 'Audit records for bounded model/agent calls. Agents write artifacts, not final score or publication state.';

CREATE INDEX IF NOT EXISTS idx_agent_invocations_workflow_created
    ON agent_invocations(workflow_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_invocations_node_created
    ON agent_invocations(node_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_invocations_role_status
    ON agent_invocations(role, status, created_at DESC);

CREATE TABLE IF NOT EXISTS approval_gates (
    id UUID PRIMARY KEY,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_run_id UUID REFERENCES workflow_node_runs(id) ON DELETE SET NULL,
    gate_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval', 'cancelled', 'blocked')
    ),
    reason TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejected_by TEXT,
    rejected_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL)
    )
);

COMMENT ON TABLE approval_gates IS 'Durable hard gates for human/publication/provider/spend/financial/unsafe actions. Pending approval is represented as awaiting_approval.';

CREATE INDEX IF NOT EXISTS idx_approval_gates_workflow_status
    ON approval_gates(workflow_run_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_gates_type_status
    ON approval_gates(gate_type, status, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workflow_node_runs_output_artifact_fk'
    ) THEN
        ALTER TABLE workflow_node_runs
            ADD CONSTRAINT workflow_node_runs_output_artifact_fk
            FOREIGN KEY (output_artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL;
    END IF;
END $$;
