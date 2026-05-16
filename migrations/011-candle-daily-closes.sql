-- CRYPTO-TUBER RANKED :: migration 011 :: candle daily close view
-- Precomputes one close per symbol/day for cheaper daily-horizon analytics.
-- Refresh strategy: application jobs should run
-- REFRESH MATERIALIZED VIEW CONCURRENTLY candle_daily_closes
-- after candle backfills and other upstream candle updates.

CREATE MATERIALIZED VIEW IF NOT EXISTS candle_daily_closes AS
SELECT DISTINCT ON (symbol, day)
  symbol,
  day,
  close,
  open_time AS close_open_time
FROM (
  SELECT
    symbol,
    date_trunc('day', to_timestamp(open_time / 1000.0) AT TIME ZONE 'UTC')::date AS day,
    close,
    open_time
  FROM candles
) daily_candles
ORDER BY symbol, day, open_time DESC;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_candle_daily_closes_symbol_day
  ON candle_daily_closes(symbol, day);
