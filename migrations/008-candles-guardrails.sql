-- CRYPTO-TUBER RANKED :: migration 008 :: candle lookup performance + ms guardrail
--
-- Price matching and consensus detection look up the most recent candle at or
-- before a millisecond timestamp. This composite index keeps those lookups off
-- sequential scans as the candles table grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candles_lookup
  ON candles(symbol, open_time DESC);

-- The candles.open_time contract is Unix time in milliseconds. Keep the
-- constraint NOT VALID so existing legacy data can be audited separately while
-- new/updated rows are still guarded from seconds-vs-ms mistakes.
ALTER TABLE candles DROP CONSTRAINT IF EXISTS candles_open_time_ms_check;

ALTER TABLE candles
  ADD CONSTRAINT candles_open_time_ms_check
  CHECK (open_time > 946684800000 AND open_time < 4102444800000)
  NOT VALID;
