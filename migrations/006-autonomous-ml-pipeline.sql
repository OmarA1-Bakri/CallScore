-- CRYPTO-TUBER RANKED :: migration 006 :: autonomous ML pipeline
-- Durable Neon-backed queue/orchestration state for Vercel-scheduled,
-- Hermes/Hetzner-executed audit-only ML verifier work.
--
-- Safe to re-run: all CREATE statements use IF NOT EXISTS and partial
-- uniqueness is added with guarded index creation.

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    run_key TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
    ),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type_created
    ON pipeline_runs(type, created_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')
    ),
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    locked_by TEXT,
    locked_at TIMESTAMPTZ,
    run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_claim
    ON pipeline_jobs(status, run_after, priority DESC, id);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_run
    ON pipeline_jobs(run_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pipeline_jobs_idempotency_key
    ON pipeline_jobs(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS pipeline_job_events (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    job_id BIGINT REFERENCES pipeline_jobs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    status TEXT,
    message TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_job_events_job
    ON pipeline_job_events(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_job_events_run
    ON pipeline_job_events(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ml_model_versions (
    id BIGSERIAL PRIMARY KEY,
    task TEXT NOT NULL DEFAULT 'ml_verifier',
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt TEXT,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    baseline BOOLEAN NOT NULL DEFAULT FALSE,
    eval_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_ml_model_versions_active
    ON ml_model_versions(task, active, baseline);

CREATE TABLE IF NOT EXISTS ml_verification_runs (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    job_id BIGINT REFERENCES pipeline_jobs(id) ON DELETE SET NULL,
    call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
    creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    candidate_bucket TEXT,
    decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'review')),
    reason_code TEXT NOT NULL CHECK (
        reason_code IN (
            'valid_call',
            'generic_word',
            'asset_not_supported',
            'direction_not_supported',
            'non_actionable',
            'quote_not_in_transcript',
            'unclear'
        )
    ),
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    evidence_span TEXT NOT NULL,
    recommended_extraction_confidence DOUBLE PRECISION NOT NULL CHECK (
        recommended_extraction_confidence >= 0 AND recommended_extraction_confidence <= 1
    ),
    reason TEXT,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_verification_runs_call
    ON ml_verification_runs(call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_verification_runs_decision
    ON ml_verification_runs(decision, reason_code, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ml_verification_runs_call_prompt_model
    ON ml_verification_runs(call_id, prompt_version, provider, model);

CREATE TABLE IF NOT EXISTS ml_training_examples (
    id BIGSERIAL PRIMARY KEY,
    call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'ml_verifier',
    split TEXT NOT NULL DEFAULT 'train' CHECK (split IN ('train', 'holdout', 'eval')),
    label TEXT NOT NULL CHECK (label IN ('approve', 'reject', 'review')),
    reason_code TEXT,
    evidence_span TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_training_examples_split
    ON ml_training_examples(source, split, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ml_training_examples_call
    ON ml_training_examples(call_id, created_at DESC);
