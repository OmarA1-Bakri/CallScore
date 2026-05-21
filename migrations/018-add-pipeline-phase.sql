-- CRYPTO-TUBER RANKED :: migration 018 :: add pipeline jobs phase column
-- Adds a `phase` TEXT column to pipeline_jobs for RALPLAN alignment.
-- Phase enum is enforced at application level, not via DB constraint.

ALTER TABLE pipeline_jobs
    ADD COLUMN IF NOT EXISTS phase TEXT;
