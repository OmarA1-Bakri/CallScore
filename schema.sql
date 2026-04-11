-- CRYPTO-TUBER RANKED - Database Schema
-- Run against existing Neon DB (alongside candles table)

-- Creators: the 20 YouTube influencers we track
CREATE TABLE IF NOT EXISTS creators (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    youtube_handle TEXT NOT NULL UNIQUE,
    youtube_channel_id TEXT,
    subscribers TEXT,
    focus TEXT,
    tier TEXT CHECK (tier IN ('free', 'pro', 'elite')) DEFAULT 'free',
    total_calls INTEGER DEFAULT 0,
    win_rate DOUBLE PRECISION DEFAULT 0,
    avg_return DOUBLE PRECISION DEFAULT 0,
    alpha_score DOUBLE PRECISION DEFAULT 0,
    accuracy_rank INTEGER,
    last_scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos: every scraped YouTube video
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
    youtube_video_id TEXT NOT NULL UNIQUE,
    title TEXT,
    published_at TIMESTAMPTZ,
    transcript TEXT,
    transcript_quality DOUBLE PRECISION DEFAULT 0,
    calls_extracted BOOLEAN DEFAULT FALSE,
    extraction_pass INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_creator ON videos(creator_id);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at);

-- Calls: every specific coin prediction extracted from videos
CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
    video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    direction TEXT CHECK (direction IN ('bullish', 'bearish', 'neutral')),
    call_type TEXT,
    entry_price DOUBLE PRECISION,
    target_price DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    timeframe TEXT,
    confidence TEXT,
    strategy_type TEXT,
    raw_quote TEXT,
    extraction_confidence DOUBLE PRECISION DEFAULT 0,
    specificity_score DOUBLE PRECISION DEFAULT 0,
    call_date TIMESTAMPTZ NOT NULL,
    -- Coin price data
    price_at_call DOUBLE PRECISION,
    price_7d DOUBLE PRECISION,
    price_30d DOUBLE PRECISION,
    price_90d DOUBLE PRECISION,
    -- BTC benchmark prices (for alpha calculation)
    btc_price_at_call DOUBLE PRECISION,
    btc_price_7d DOUBLE PRECISION,
    btc_price_30d DOUBLE PRECISION,
    btc_price_90d DOUBLE PRECISION,
    -- Returns
    return_7d DOUBLE PRECISION,
    return_30d DOUBLE PRECISION,
    return_90d DOUBLE PRECISION,
    -- Alpha over BTC (excess return)
    alpha_7d DOUBLE PRECISION,
    alpha_30d DOUBLE PRECISION,
    alpha_90d DOUBLE PRECISION,
    -- Scoring
    hit_target BOOLEAN,
    correct_direction BOOLEAN,
    regime_at_call INTEGER,
    regime_difficulty DOUBLE PRECISION DEFAULT 0.5,
    score DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_creator ON calls(creator_id);
CREATE INDEX IF NOT EXISTS idx_calls_symbol ON calls(symbol);
CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(call_date);
CREATE INDEX IF NOT EXISTS idx_calls_score ON calls(score DESC);

-- Creator stats: precomputed leaderboard data per period
CREATE TABLE IF NOT EXISTS creator_stats (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES creators(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    total_calls INTEGER DEFAULT 0,
    win_rate DOUBLE PRECISION DEFAULT 0,
    avg_return_7d DOUBLE PRECISION DEFAULT 0,
    avg_return_30d DOUBLE PRECISION DEFAULT 0,
    avg_return_90d DOUBLE PRECISION DEFAULT 0,
    avg_alpha_30d DOUBLE PRECISION DEFAULT 0,
    best_call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
    worst_call_id INTEGER REFERENCES calls(id) ON DELETE SET NULL,
    hit_rate DOUBLE PRECISION DEFAULT 0,
    most_called_symbol TEXT,
    strategy_consistency DOUBLE PRECISION DEFAULT 0,
    specificity_avg DOUBLE PRECISION DEFAULT 0,
    alpha_score DOUBLE PRECISION DEFAULT 0,
    accuracy_rank INTEGER,
    effective_n INTEGER DEFAULT 0,
    wilson_lb DOUBLE PRECISION DEFAULT 0,
    bullish_win_rate DOUBLE PRECISION DEFAULT 0,
    bearish_win_rate DOUBLE PRECISION DEFAULT 0,
    bullish_pct DOUBLE PRECISION DEFAULT 0,
    sharpe_ratio DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(creator_id, period)
);

CREATE INDEX IF NOT EXISTS idx_creator_stats_rank ON creator_stats(period, accuracy_rank);

-- Consensus signals: when 3+ top creators converge on same coin
CREATE TABLE IF NOT EXISTS consensus_signals (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    direction TEXT CHECK (direction IN ('bullish', 'bearish')),
    creator_count INTEGER NOT NULL,
    creator_ids INTEGER[] NOT NULL,
    call_ids INTEGER[] NOT NULL,
    signal_date TIMESTAMPTZ NOT NULL,
    avg_target_price DOUBLE PRECISION,
    price_at_signal DOUBLE PRECISION,
    price_7d DOUBLE PRECISION,
    price_30d DOUBLE PRECISION,
    return_7d DOUBLE PRECISION,
    return_30d DOUBLE PRECISION,
    correct BOOLEAN,
    quality_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consensus_date ON consensus_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_consensus_symbol ON consensus_signals(symbol);
