/**
 * ticker-normalize.ts — canonical symbol resolution shared by detection /
 * analytics code paths.
 *
 * The canonical form is the Binance spot pair symbol (e.g. BTCUSDT). Callers
 * can feed us short tickers (`BTC`), long names (`Bitcoin`, `bitcoin`), or
 * mixed-case variants (`BtcUsdt`); we collapse all of them to the canonical
 * USDT pair when the symbol is tracked, and return `null` otherwise.
 *
 * Kept deliberately small (no DB, no regex dependencies) so it can be
 * imported by both server scripts and pure detection logic.
 */
import { SYMBOL_NAMES, SYMBOL_TICKERS, TRACKED_SYMBOLS } from "./constants";

const TRACKED_SET: ReadonlySet<string> = new Set<string>(TRACKED_SYMBOLS);

// One-time reverse lookup: every alias (short ticker, name, USDT pair,
// USD pair) maps back to the canonical USDT symbol. Keys are lowercase.
const ALIAS_LOOKUP: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const canonical of TRACKED_SYMBOLS) {
    out.set(canonical.toLowerCase(), canonical);

    // Short ticker: "BTC"
    const ticker = SYMBOL_TICKERS[canonical];
    if (ticker) out.set(ticker.toLowerCase(), canonical);

    // Full name: "Bitcoin"
    const name = SYMBOL_NAMES[canonical];
    if (name) out.set(name.toLowerCase(), canonical);

    // USD pair variant: "BTCUSD"
    if (ticker) out.set(`${ticker.toLowerCase()}usd`, canonical);
  }
  return out;
})();

/**
 * Normalize any ticker-shaped input to its canonical USDT symbol.
 * Returns null when the input does not resolve to a tracked symbol.
 */
export function normalizeTicker(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const key = trimmed.toLowerCase();
  const direct = ALIAS_LOOKUP.get(key);
  if (direct) return direct;

  // Fall back to the upstream rule: uppercase, accept if tracked.
  const upper = trimmed.toUpperCase();
  return TRACKED_SET.has(upper) ? upper : null;
}

/**
 * Short ticker form (e.g. "BTC") of a canonical symbol. Used to build
 * ticker-proximity regexes in detection code.
 */
export function shortTicker(canonical: string): string | null {
  return SYMBOL_TICKERS[canonical] ?? null;
}

/**
 * Human display name (e.g. "Bitcoin") of a canonical symbol. Used to
 * detect ticker/coin-name proximity in raw transcript quotes.
 */
export function coinName(canonical: string): string | null {
  return SYMBOL_NAMES[canonical] ?? null;
}
