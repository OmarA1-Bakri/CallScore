-- CRYPTO-TUBER RANKED :: migration 017 :: reason-code lookup for ml verifier
-- Move verifier reason-code extensibility out of brittle CHECK constraints.
-- Operational model failures are audit outcomes, so they must be valid reason codes.

CREATE TABLE IF NOT EXISTS ml_verification_reason_codes (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ml_verification_reason_codes (code, category, is_terminal)
VALUES
  ('valid_call', 'semantic', true),
  ('generic_word', 'semantic', true),
  ('asset_not_supported', 'semantic', true),
  ('direction_not_supported', 'semantic', true),
  ('non_actionable', 'semantic', true),
  ('quote_not_in_transcript', 'evidence', true),
  ('unclear', 'review', true),
  ('missing_evidence', 'evidence', true),
  ('model_timeout', 'provider_failure', true),
  ('malformed_model_output', 'provider_failure', true),
  ('model_provider_error', 'provider_failure', true)
ON CONFLICT (code) DO UPDATE
SET category = EXCLUDED.category,
    is_terminal = EXCLUDED.is_terminal;

DO $$
DECLARE
  conname_var text;
BEGIN
  SELECT conname INTO conname_var
  FROM pg_constraint
  WHERE conrelid = 'ml_verification_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%reason_code IN%'
  LIMIT 1;

  IF FOUND THEN
    EXECUTE format('ALTER TABLE ml_verification_runs DROP CONSTRAINT %I', conname_var);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'ml_verification_runs'::regclass
      AND conname = 'fk_ml_verification_runs_reason_code'
  ) THEN
    ALTER TABLE ml_verification_runs
      ADD CONSTRAINT fk_ml_verification_runs_reason_code
      FOREIGN KEY (reason_code)
      REFERENCES ml_verification_reason_codes(code);
  END IF;
END $$;
