-- CRYPTO-TUBER RANKED :: migration 023 :: artifact chain
-- Owner: CallScore control plane.
-- Purpose: Durable immutable artifact lineage links layered on the Phase 2
-- artifacts table. This supports score/evaluation/call/evidence/transcript/video
-- provenance without mutating final business tables.
-- Lifecycle: append-first audit data. Corrections should create new artifacts
-- and new links rather than rewriting historical artifact lineage.

CREATE TABLE IF NOT EXISTS artifact_links (
    id UUID PRIMARY KEY,
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    child_artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    parent_artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
    link_type TEXT NOT NULL CHECK (
        link_type IN (
            'derived_from',
            'evidence_for',
            'validated_by',
            'priced_by',
            'scored_by',
            'publication_decision_for'
        )
    ),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (child_artifact_id <> parent_artifact_id),
    UNIQUE (child_artifact_id, parent_artifact_id, link_type)
);

COMMENT ON TABLE artifact_links IS 'Immutable parent/child links between CallScore control-plane artifacts. Enables score-to-evidence lineage without mutating calls, scores, or leaderboard rows.';
COMMENT ON COLUMN artifact_links.child_artifact_id IS 'Newer/derived artifact, for example score_evaluation.';
COMMENT ON COLUMN artifact_links.parent_artifact_id IS 'Source/provenance artifact, for example price_resolution or normalized_calls.';
COMMENT ON COLUMN artifact_links.link_type IS 'Semantic relationship between child and parent artifacts; most processing uses derived_from.';

CREATE INDEX IF NOT EXISTS idx_artifact_links_workflow_created
    ON artifact_links(workflow_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_links_child
    ON artifact_links(child_artifact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_links_parent
    ON artifact_links(parent_artifact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_links_type_created
    ON artifact_links(link_type, created_at DESC);
