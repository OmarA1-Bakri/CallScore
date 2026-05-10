-- CRYPTO-TUBER RANKED :: migration 010 :: pipeline job heartbeats
-- Adds worker heartbeat tracking and a supporting index for stale-job recovery.

ALTER TABLE pipeline_jobs
    ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_stale_running
    ON pipeline_jobs(heartbeat_at, locked_at, updated_at, id)
    WHERE status = 'running';
