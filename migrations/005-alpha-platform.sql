ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_tier_check;
ALTER TABLE creators
  ADD CONSTRAINT creators_tier_check
  CHECK (tier IN ('free', 'pro', 'alpha', 'elite'));

UPDATE creators SET tier = 'alpha' WHERE tier = 'elite';

CREATE TABLE IF NOT EXISTS alpha_api_keys (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alpha_api_keys_user
  ON alpha_api_keys(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS alpha_webhooks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT ARRAY['new_call_digest', 'consensus_signal'],
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alpha_webhooks_user
  ON alpha_webhooks(user_id, active);

CREATE TABLE IF NOT EXISTS alpha_webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES alpha_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status INTEGER,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE alpha_webhook_deliveries
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_alpha_webhook_deliveries_webhook
  ON alpha_webhook_deliveries(webhook_id, created_at DESC);
