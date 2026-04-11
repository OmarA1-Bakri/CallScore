export const TRACKED_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "DOTUSDT",
  "LINKUSDT",
  "TAOUSDT",
  "RENDERUSDT",
  "FETUSDT",
  "NEARUSDT",
  "ARUSDT",
  "INJUSDT",
  "SUIUSDT",
  "PENDLEUSDT",
] as const;

export type TrackedSymbol = (typeof TRACKED_SYMBOLS)[number];

export const SYMBOL_NAMES: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  SOLUSDT: "Solana",
  BNBUSDT: "BNB",
  XRPUSDT: "XRP",
  DOGEUSDT: "Dogecoin",
  ADAUSDT: "Cardano",
  AVAXUSDT: "Avalanche",
  DOTUSDT: "Polkadot",
  LINKUSDT: "Chainlink",
  TAOUSDT: "Bittensor",
  RENDERUSDT: "Render",
  FETUSDT: "Fetch.ai",
  NEARUSDT: "NEAR",
  ARUSDT: "Arweave",
  INJUSDT: "Injective",
  SUIUSDT: "Sui",
  PENDLEUSDT: "Pendle",
};

export const SYMBOL_TICKERS: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  BNBUSDT: "BNB",
  XRPUSDT: "XRP",
  DOGEUSDT: "DOGE",
  ADAUSDT: "ADA",
  AVAXUSDT: "AVAX",
  DOTUSDT: "DOT",
  LINKUSDT: "LINK",
  TAOUSDT: "TAO",
  RENDERUSDT: "RENDER",
  FETUSDT: "FET",
  NEARUSDT: "NEAR",
  ARUSDT: "AR",
  INJUSDT: "INJ",
  SUIUSDT: "SUI",
  PENDLEUSDT: "PENDLE",
};

export const REGIME_LABELS: Record<number, string> = {
  0: "Strong Bull",
  1: "Bull",
  2: "Mild Bull",
  3: "Neutral",
  4: "Mild Bear",
  5: "Bear",
  6: "Crash",
};

export const REGIME_COLORS: Record<number, string> = {
  0: "#26de81",
  1: "#2ed573",
  2: "#7bed9f",
  3: "#6b7280",
  4: "#ff6b6b",
  5: "#fc5c65",
  6: "#eb3b5a",
};

// Time intervals in milliseconds
export const MS_PER_DAY = 86_400_000;
export const MS_7D = 7 * MS_PER_DAY;
export const MS_30D = 30 * MS_PER_DAY;
export const MS_90D = 90 * MS_PER_DAY;

// Consensus signal thresholds.
// Tiered by market cap: BTC/ETH are called by everyone, so consensus
// needs MORE creators to be meaningful. Small caps are more selective.
export const CONSENSUS_MIN_CREATORS = 5;
export const CONSENSUS_WINDOW_DAYS = 5;

// High-threshold symbols: every YouTuber talks about these, so
// consensus with few creators is trivially easy and meaningless.
// BTC at 10+ has 53.8% accuracy vs 45.2% at 5+. BTC consensus at 58.3%.
// ETH consensus at 0% (0/2) — terrible signal, needs more data.
// Creator count is monotonically predictive: ≥12 creators = 57.1% accuracy.
export const CONSENSUS_HIGH_THRESHOLD_SYMBOLS = new Set([
  "BTCUSDT",
  "ETHUSDT",
]);
export const CONSENSUS_HIGH_THRESHOLD_MIN = 10;

// Consensus correctness threshold: 2% magnitude floor (same as individual
// calls). Direction-specific and higher thresholds were tested but performed
// worse — bearish consensus at 50% accuracy is the key signal, and raising
// the threshold destroyed that advantage.
export const CONSENSUS_CORRECT_THRESHOLD = 2;

// Direction base rates: fraction of matched calls where the 30d return
// falls into each zone. Computed from the full dataset (4224 matched calls).
// Used to adjust direction scoring — correct bullish calls are harder
// (only 30.5% of outcomes are positive >2%) and should score higher.
// These are structural rates; recalibrate if the dataset changes significantly.
export const DIRECTION_BASE_RATES: Readonly<Record<string, number>> = {
  bullish: 0.305,
  bearish: 0.533,
  neutral: 0.162,
};
