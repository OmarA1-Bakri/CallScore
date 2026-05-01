-- CRYPTO-TUBER RANKED :: migration 004 :: alert unsubscribes
-- Durable opt-out state for alert digest unsubscribe links.

CREATE TABLE IF NOT EXISTS alerts_unsubscribes (
    user_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
