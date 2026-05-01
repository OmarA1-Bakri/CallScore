-- CRYPTO-TUBER RANKED :: migration 001 :: watchlists + alerts_queue
-- Adds per-user creator watchlists and a durable outbound alerts queue.
-- Safe to re-run: uses IF NOT EXISTS.

-- Watchlists: one row per (user, creator) pair.
-- user_id is TEXT because Whop user ids are opaque strings.
CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);

-- Alerts queue: durable outbox for per-creator email notifications.
-- sent_at IS NULL -> still pending. Partial index keeps scans cheap
-- even as the table accumulates history.
CREATE TABLE IF NOT EXISTS alerts_queue (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
    call_id INTEGER REFERENCES calls(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'new_call',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_queue_pending
    ON alerts_queue(user_id, created_at)
    WHERE sent_at IS NULL;

-- Prevent duplicate enqueue for the same (user, call) pair; the cron
-- relies on this for idempotency when it reruns over the same window.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_alerts_queue_user_call
    ON alerts_queue(user_id, call_id)
    WHERE call_id IS NOT NULL;
