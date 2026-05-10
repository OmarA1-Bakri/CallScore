-- CRYPTO-TUBER RANKED :: migration 014 :: gated ML promotion audit trail
-- Records every disabled-by-default ML promotion attempt before any call
-- confidence mutation can occur.

CREATE TABLE IF NOT EXISTS ml_promotion_audit (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    job_id BIGINT REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
    prompt_version TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    dry_run BOOLEAN NOT NULL DEFAULT TRUE,
    write_requested BOOLEAN NOT NULL DEFAULT FALSE,
    gate_passed BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL CHECK (
        status IN ('blocked', 'dry_run', 'running', 'succeeded', 'failed')
    ),
    manual_reviewed_by TEXT,
    manual_review_ticket TEXT,
    shadow_diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    gold_set_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    candidate_call_ids INTEGER[] NOT NULL DEFAULT '{}'::integer[],
    promoted_call_ids INTEGER[] NOT NULL DEFAULT '{}'::integer[],
    promoted_count INTEGER GENERATED ALWAYS AS (cardinality(promoted_call_ids)) STORED,
    gate_results JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_ml_promotion_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ml_promotion_audit_updated_at ON ml_promotion_audit;

CREATE TRIGGER trg_ml_promotion_audit_updated_at
BEFORE UPDATE ON ml_promotion_audit
FOR EACH ROW
EXECUTE FUNCTION update_ml_promotion_audit_updated_at();

CREATE INDEX IF NOT EXISTS idx_ml_promotion_audit_created
    ON ml_promotion_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_promotion_audit_job
    ON ml_promotion_audit(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_promotion_audit_run
    ON ml_promotion_audit(run_id, created_at DESC);
