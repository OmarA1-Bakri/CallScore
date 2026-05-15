CREATE TABLE IF NOT EXISTS alpha_api_key_requests (
  id SERIAL PRIMARY KEY,
  api_key_id INTEGER REFERENCES alpha_api_keys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alpha_api_key_requests_user
  ON alpha_api_key_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alpha_api_key_requests_key
  ON alpha_api_key_requests(api_key_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_reports (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  email TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_created
  ON feedback_reports(created_at DESC);
