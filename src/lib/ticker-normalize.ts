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

/**
 * Manual alias table for venue-specific or community tickers that don't
 * appear in the canonical ticker/name lookup.
 *
 * - `XBT` is the ISO-style "non-national-currency" prefix used by BitMEX,
 *   Kraken, and referenced in many transcripts. Maps to BTCUSDT.
 *
 * Keep this list tight — every entry widens the match surface for the
 *`findMentionedTickerNear` proximity check and can create false positives
 * on common English words if we aren't careful.
 */
const MANUAL_ALIASES: Readonly<Record<string, string>> = {
  xbt: "BTCUSDT",
  xbtusd: "BTCUSDT",
  xbtusdt: "BTCUSDT",
};

// One-time reverse lookup: every alias (short ticker, name, USDT pair,
// USD pair, manual) maps back to the canonical USDT symbol. Keys lowercase.
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
  for (const [alias, canonical] of Object.entries(MANUAL_ALIASES)) {
    out.set(alias, canonical);
  }
  return out;
})();

// Reverse index: canonical symbol -> list of extra aliases (manual + name
// variants) we should search for when doing ticker-proximity matching.
const EXTRA_ALIASES_BY_CANONICAL: ReadonlyMap<string, readonly string[]> =
  (() => {
    const out = new Map<string, string[]>();
    for (const [alias, canonical] of Object.entries(MANUAL_ALIASES)) {
      const list = out.get(canonical) ?? [];
      list.push(alias);
      out.set(canonical, list);
    }
    // Freeze: callers read-only.
    const frozen = new Map<string, readonly string[]>();
    for (const entry of Array.from(out.entries())) {
      frozen.set(entry[0], entry[1]);
    }
    return frozen;
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

/**
 * Any extra aliases (besides the short ticker and coin name) that the
 * proximity check should match on. Currently populated from
 * `MANUAL_ALIASES`; empty list for symbols without manual aliases.
 */
export function extraAliases(canonical: string): readonly string[] {
  return EXTRA_ALIASES_BY_CANONICAL.get(canonical) ?? [];
}
