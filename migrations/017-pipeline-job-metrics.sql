-- CRYPTO-TUBER RANKED :: migration 017 :: pipeline job metrics
-- Adds JSONB metrics column to pipeline_jobs for dispatch audit logging.

ALTER TABLE pipeline_jobs
    ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;
