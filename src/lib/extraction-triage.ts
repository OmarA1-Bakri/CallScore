import { SYMBOL_NAMES, SYMBOL_TICKERS, TRACKED_SYMBOLS } from "./constants";

export interface KeywordWindow {
  readonly symbol: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const DIRECTION_WORDS = /\b(long|short|buy|sell|bullish|bearish|breakout|support|resistance|target|stop loss|accumulate|take profit)\b/i;

function aliasesFor(symbol: string): readonly string[] {
  const ticker = SYMBOL_TICKERS[symbol];
  const name = SYMBOL_NAMES[symbol];
  return [symbol.replace(/USDT$/i, ""), ticker, name].filter((value): value is string => Boolean(value));
}

export function scoreTranscriptForExtraction(transcript: string): number {
  const lower = transcript.toLowerCase();
  const symbolHits = TRACKED_SYMBOLS.reduce((count, symbol) => (
    count + (aliasesFor(symbol).some((alias) => lower.includes(alias.toLowerCase())) ? 1 : 0)
  ), 0);
  const directionHits = (transcript.match(new RegExp(DIRECTION_WORDS.source, "gi")) ?? []).length;
  return symbolHits * 2 + Math.min(directionHits, 20);
}

export function buildKeywordWindows(
  transcript: string,
  windowChars = 1400,
  maxWindows = 12,
): readonly KeywordWindow[] {
  const windows: KeywordWindow[] = [];
  const lower = transcript.toLowerCase();
  for (const symbol of TRACKED_SYMBOLS) {
    for (const alias of aliasesFor(symbol)) {
      const needle = alias.toLowerCase();
      let offset = lower.indexOf(needle);
      while (offset >= 0 && windows.length < maxWindows) {
        const start = Math.max(0, offset - Math.floor(windowChars / 2));
        const end = Math.min(transcript.length, start + windowChars);
        const text = transcript.slice(start, end);
        if (DIRECTION_WORDS.test(text)) windows.push({ symbol, start, end, text });
        offset = lower.indexOf(needle, offset + needle.length);
      }
      if (windows.length >= maxWindows) break;
    }
    if (windows.length >= maxWindows) break;
  }
  return windows;
}
