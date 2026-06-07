-- CRYPTO-TUBER RANKED :: migration 008 :: launch pipeline ops
-- Adds durable metadata for deterministic price repairs and low-confidence
-- validation decisions so the nonstop pipeline can advance without repeatedly
-- reprocessing the same blocked calls.

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS price_repaired_by TEXT,
  ADD COLUMN IF NOT EXISTS price_repair_tolerance_ms INTEGER,
  ADD COLUMN IF NOT EXISTS price_repaired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_repair_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS low_confidence_validation_decision TEXT,
  ADD COLUMN IF NOT EXISTS low_confidence_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS low_confidence_validation_by TEXT,
  ADD COLUMN IF NOT EXISTS low_confidence_validation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_calls_missing_price_at_call
  ON calls(id)
  WHERE price_at_call IS NULL;

CREATE INDEX IF NOT EXISTS idx_calls_low_confidence_validation_queue
  ON calls(id)
  WHERE extraction_confidence < 0.7
    AND low_confidence_validation_decision IS NULL;
