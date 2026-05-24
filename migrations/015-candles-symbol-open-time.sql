-- CRYPTO-TUBER RANKED :: migration 015 :: candles symbol/open_time support index
-- Speeds the set-based matcher's symbol + open_time range lookups.

CREATE INDEX IF NOT EXISTS idx_candles_symbol_open_time
  ON candles(symbol, open_time);