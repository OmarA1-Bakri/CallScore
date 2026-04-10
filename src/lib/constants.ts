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

// Consensus signal threshold
// Raised from 3 to 4: with ~19 creators, 3 is too easy to hit by chance.
// 4 unique creators within 5 days is more meaningful agreement.
export const CONSENSUS_MIN_CREATORS = 4;
export const CONSENSUS_WINDOW_DAYS = 5;
