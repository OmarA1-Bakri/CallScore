-- CRYPTO-TUBER RANKED :: migration 013 :: LLM extraction gold set
-- Stores human-reviewed examples for extraction bakeoffs and regression gates.

CREATE TABLE IF NOT EXISTS llm_gold_examples (
  id BIGSERIAL PRIMARY KEY,
  video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'human_review',
  split TEXT NOT NULL DEFAULT 'eval' CHECK (split IN ('train', 'holdout', 'eval')),
  transcript_excerpt TEXT NOT NULL,
  expected_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  false_positive_bucket TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'llm_gold_examples_expected_calls_is_array'
  ) THEN
    ALTER TABLE llm_gold_examples
      ADD CONSTRAINT llm_gold_examples_expected_calls_is_array
      CHECK (jsonb_typeof(expected_calls) = 'array');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_llm_gold_examples_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_llm_gold_examples_updated_at ON llm_gold_examples;

CREATE TRIGGER trigger_update_llm_gold_examples_updated_at
BEFORE UPDATE ON llm_gold_examples
FOR EACH ROW
EXECUTE FUNCTION update_llm_gold_examples_updated_at();

CREATE INDEX IF NOT EXISTS idx_llm_gold_examples_split
  ON llm_gold_examples(split, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_gold_examples_video_id
  ON llm_gold_examples(video_id);
