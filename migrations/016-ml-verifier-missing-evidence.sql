-- CRYPTO-TUBER RANKED :: migration 016 :: extend ml_verifier reason_code for missing_evidence
-- The ml-verifier now classifies candidates with empty evidence spans as
-- "missing_evidence" rather than silently accepting an empty string.

-- PostgreSQL auto-generates unnamed CHECK constraint names like
-- "ml_verification_runs_reason_code_check". We drop any constraint on reason_code
-- and recreate with the expanded enum.

DO $$
DECLARE
  conname_var text;
BEGIN
  SELECT conname INTO conname_var
  FROM pg_constraint
  WHERE conrelid = 'ml_verification_runs'::regclass
    AND contype = 'c'
    AND conname = 'ml_verification_runs_reason_code_check';

  IF FOUND THEN
    EXECUTE format('ALTER TABLE ml_verification_runs DROP CONSTRAINT %I', conname_var);
  ELSE
    -- Fallback: find any CHECK constraint on reason_code (pre-named constraint)
    SELECT conname INTO conname_var
    FROM pg_constraint
    WHERE conrelid = 'ml_verification_runs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%reason_code IN%'
    LIMIT 1;

    IF FOUND THEN
      EXECUTE format('ALTER TABLE ml_verification_runs DROP CONSTRAINT %I', conname_var);
    END IF;
  END IF;
END $$;

ALTER TABLE ml_verification_runs
  ADD CONSTRAINT ml_verification_runs_reason_code_check
  CHECK (
    reason_code IN (
      'valid_call',
      'generic_word',
      'asset_not_supported',
      'direction_not_supported',
      'non_actionable',
      'quote_not_in_transcript',
      'unclear',
      'missing_evidence'
    )
  );
