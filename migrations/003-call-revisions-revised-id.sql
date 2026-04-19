-- CRYPTO-TUBER RANKED :: migration 003 :: link revision to the revising call
--
-- Adds `revised_call_id`, the call that replaced or corrected the original.
-- Needed so we can score reversed_direction revisions against the LATER call's
-- realized outcome rather than inferring "was the reversal vindicated?" from
-- the original call alone.
--
-- Safe to re-run: IF NOT EXISTS guards the column add and every index.

ALTER TABLE call_revisions
    ADD COLUMN IF NOT EXISTS revised_call_id INTEGER
        REFERENCES calls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_revisions_revised_call
    ON call_revisions(revised_call_id);
