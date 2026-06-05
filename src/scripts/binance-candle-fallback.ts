import { query } from "../lib/db";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const INTERVAL = "1m";
const BINANCE_LIMIT = 1000;

export interface FetchedCandle {
  readonly open_time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

function parseCandle(row: unknown[]): FetchedCandle | null {
  const candle = {
    open_time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
  return Number.isFinite(candle.open_time) && Number.isFinite(candle.close)
    ? candle
    : null;
}

export async function fetchNearestBinanceCandle(input: {
  readonly symbol: string;
  readonly targetMs: number;
  readonly toleranceMs: number;
}): Promise<FetchedCandle | null> {
  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set("symbol", input.symbol);
  url.searchParams.set("interval", INTERVAL);
  url.searchParams.set("startTime", String(input.targetMs - input.toleranceMs));
  url.searchParams.set("endTime", String(input.targetMs + input.toleranceMs));
  url.searchParams.set("limit", String(BINANCE_LIMIT));

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500) return null;
    const body = await response.text().catch(() => "");
    throw new Error(`Binance ${input.symbol} HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as unknown[];
  const candles = data
    .filter((row): row is unknown[] => Array.isArray(row))
    .map(parseCandle)
    .filter((row): row is FetchedCandle => row !== null);
  if (candles.length === 0) return null;
  candles.sort((a, b) => {
    const delta = Math.abs(a.open_time - input.targetMs) - Math.abs(b.open_time - input.targetMs);
    return delta === 0 ? b.open_time - a.open_time : delta;
  });
  const nearest = candles[0];
  return Math.abs(nearest.open_time - input.targetMs) <= input.toleranceMs
    ? nearest
    : null;
}

export async function insertFetchedCandle(
  symbol: string,
  candle: FetchedCandle,
): Promise<void> {
  await query(
    `INSERT INTO candles (symbol, interval, open_time, open, high, low, close, volume)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (symbol, interval, open_time) DO NOTHING`,
    [
      symbol,
      INTERVAL,
      candle.open_time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ],
  );
}
