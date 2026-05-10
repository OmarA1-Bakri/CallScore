-- CRYPTO-TUBER RANKED :: migration 012 :: transcript status tracking
-- Enables provider waterfall/retry accounting before adding non-yt-dlp providers.

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS transcript_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'attempted', 'available', 'failed')),
  ADD COLUMN IF NOT EXISTS transcript_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (transcript_attempts >= 0),
  ADD COLUMN IF NOT EXISTS transcript_provider TEXT,
  ADD COLUMN IF NOT EXISTS transcript_error TEXT,
  ADD COLUMN IF NOT EXISTS transcript_last_attempt_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'videos_transcript_available_requires_provider'
  ) THEN
    ALTER TABLE videos
      ADD CONSTRAINT videos_transcript_available_requires_provider
      CHECK (transcript_status <> 'available' OR transcript_provider IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'videos_transcript_failed_requires_error_or_attempt'
  ) THEN
    ALTER TABLE videos
      ADD CONSTRAINT videos_transcript_failed_requires_error_or_attempt
      CHECK (
        transcript_status <> 'failed'
        OR (
          transcript_attempts > 0
          AND transcript_last_attempt_at IS NOT NULL
          AND COALESCE(NULLIF(transcript_error, ''), '') <> ''
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_videos_transcript_status
  ON videos(transcript_status, transcript_last_attempt_at NULLS FIRST, published_at DESC);
