import { SYMBOL_NAMES, SYMBOL_TICKERS, TRACKED_SYMBOLS } from "./constants";

export interface KeywordWindow {
  readonly symbol: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const DIRECTION_WORDS = /\b(long|short|buy|sell|bullish|bearish|breakout|support|resistance|target|stop loss|accumulate|take profit)\b/i;
export const DEFAULT_KEYWORD_WINDOW_CHARS = 1400;
export const DEFAULT_MAX_KEYWORD_WINDOWS = 12;

function escapeRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function aliasRegex(alias: string): RegExp {
  return new RegExp(`(?<!\\w)${escapeRegex(alias)}(?!\\w)`, "gi");
}

function aliasesFor(symbol: string): readonly string[] {
  const ticker = SYMBOL_TICKERS[symbol];
  const name = SYMBOL_NAMES[symbol];
  const candidates = [symbol, symbol.replace(/USDT$/i, ""), ticker, name].filter(
    (value): value is string => Boolean(value),
  );
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    aliases.push(normalized);
  }
  return aliases;
}

export function scoreTranscriptForExtraction(transcript: string): number {
  const symbolHits = TRACKED_SYMBOLS.reduce((count, symbol) => (
    count + (aliasesFor(symbol).some((alias) => aliasRegex(alias).test(transcript)) ? 1 : 0)
  ), 0);
  const directionHits = (transcript.match(new RegExp(DIRECTION_WORDS.source, "gi")) ?? []).length;
  return symbolHits * 2 + Math.min(directionHits, 20);
}

export function buildKeywordWindows(
  transcript: string,
  windowChars = DEFAULT_KEYWORD_WINDOW_CHARS,
  maxWindows = DEFAULT_MAX_KEYWORD_WINDOWS,
): readonly KeywordWindow[] {
  const windows: KeywordWindow[] = [];
  for (const symbol of TRACKED_SYMBOLS) {
    for (const alias of aliasesFor(symbol)) {
      const matches = transcript.matchAll(aliasRegex(alias));
      for (const match of matches) {
        const offset = match.index ?? -1;
        if (offset < 0) continue;
        const start = Math.max(0, offset - Math.floor(windowChars / 2));
        const end = Math.min(transcript.length, start + windowChars);
        const text = transcript.slice(start, end);
        if (DIRECTION_WORDS.test(text)) windows.push({ symbol, start, end, text });
      }
    }
  }
  const deduped = windows
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .filter((window, index, items) => index === 0 || window.start !== items[index - 1].start)
    .slice(0, maxWindows);
  return deduped;
}
