-- CRYPTO-TUBER RANKED :: migration 002 :: call revisions (self-correction index)
-- Tracks detected revisions of prior calls: target updates, direction reversals,
-- retractions, and acknowledged misses. Feeds the self-correction score that
-- rewards creators who publicly update their views vs silently memory-hole losers.
--
-- Safe to re-run: all statements use IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS call_revisions (
    id SERIAL PRIMARY KEY,
    original_call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    revised_at TIMESTAMP NOT NULL,
    revision_type TEXT NOT NULL CHECK (
        revision_type IN (
            'updated_target',
            'reversed_direction',
            'retracted',
            'confirmed_miss'
        )
    ),
    source_video_id TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_revisions_creator
    ON call_revisions(creator_id);

CREATE INDEX IF NOT EXISTS idx_call_revisions_original
    ON call_revisions(original_call_id);

-- Idempotency anchor: one row per (original call, revision type). The backfill
-- script upserts with ON CONFLICT DO NOTHING against this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_revisions_unique
    ON call_revisions(original_call_id, revision_type);
