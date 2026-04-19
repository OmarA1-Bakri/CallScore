// Shared parsers + defaults for the backtest query parameters. Used by
// both the API route (which receives `string | null` from URLSearchParams)
// and the SSR page (which receives `string | undefined` from Next
// searchParams). Centralized so the day-boundary normalization rule
// — start = start-of-day UTC, end = end-of-day UTC — lives in one place.

const DEFAULT_RANGE_DAYS = 365;

function isEmpty(raw: string | null | undefined): raw is null | undefined | "" {
  return raw === null || raw === undefined || raw.length === 0;
}

export function parseIsoDate(raw: string | null | undefined): Date | null {
  if (isEmpty(raw)) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

// Date-only inputs like "2025-12-31" parse as 2025-12-31T00:00:00Z.
// Snap to start-of-day UTC so the engine's inclusive call_date >= start
// filter reliably includes calls on the boundary day.
export function parseIsoDateAsStartOfDay(
  raw: string | null | undefined,
): Date | null {
  const d = parseIsoDate(raw);
  if (d === null) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Date-only inputs like "2025-12-31" parse as 2025-12-31T00:00:00Z.
// Snap to end-of-day UTC so the engine's inclusive call_date <= end
// filter doesn't silently drop calls timestamped later on the boundary day.
export function parseIsoDateAsEndOfDay(
  raw: string | null | undefined,
): Date | null {
  const d = parseIsoDate(raw);
  if (d === null) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export interface BacktestRange {
  readonly start: Date;
  readonly end: Date;
}

// Default date range for a backtest view: trailing 365 days, snapped to
// UTC day boundaries. Accepts `now` so callers can pin a deterministic
// clock during tests.
export function defaultBacktestRange(now: Date = new Date()): BacktestRange {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - DEFAULT_RANGE_DAYS);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}
