-- CRYPTO-TUBER RANKED :: migration 018 :: pipeline job leases
-- Running jobs now have an explicit lease in addition to heartbeat timestamps.
-- Workers extend the lease on each heartbeat; stale leases are reset to pending.

ALTER TABLE pipeline_jobs
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipeline_jobs_running_lease_expiry
  ON pipeline_jobs(lease_expires_at, id)
  WHERE status = 'running';
