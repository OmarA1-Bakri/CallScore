export interface LiveCallPricingFields {
  readonly live_price?: number | null;
  readonly live_price_at?: string | null;
  readonly btc_live_price?: number | null;
  readonly btc_live_price_at?: string | null;
}

export function getLiveCallPriceSelectSql(): string {
  return [
    "live_coin.close::float8 AS live_price",
    "(to_timestamp(live_coin.open_time / 1000.0) AT TIME ZONE 'UTC')::text AS live_price_at",
    "live_btc.close::float8 AS btc_live_price",
    "(to_timestamp(live_btc.open_time / 1000.0) AT TIME ZONE 'UTC')::text AS btc_live_price_at",
  ].join(",\n       ");
}

export function getLiveCallPriceJoinSql(callAlias = "c"): string {
  return `LEFT JOIN LATERAL (
       SELECT close, open_time
       FROM candles
       WHERE symbol = ${callAlias}.symbol
       ORDER BY open_time DESC
       LIMIT 1
     ) live_coin ON true
     LEFT JOIN LATERAL (
       SELECT close, open_time
       FROM candles
       WHERE symbol = 'BTCUSDT'
       ORDER BY open_time DESC
       LIMIT 1
     ) live_btc ON true`;
}
