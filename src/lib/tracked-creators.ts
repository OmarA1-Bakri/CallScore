export interface TrackedCreatorSeed {
  readonly name: string;
  readonly youtube_handle: string;
  readonly subscribers: string;
  readonly focus: string;
}

export const TRACKED_CREATORS: readonly TrackedCreatorSeed[] = [
  { name: "Altcoin Daily", youtube_handle: "@AltcoinDaily", subscribers: "1.65M", focus: "Daily altcoin picks, BTC/ETH/ADA/SOL, AI tokens" },
  { name: "Alex Becker", youtube_handle: "@AlexBeckersChannel", subscribers: "1.6M", focus: "Bold altcoin calls, AI crypto (RENDER, FET, TAO)" },
  { name: "Discover Crypto", youtube_handle: "@DiscoverCrypto_", subscribers: "1.4M", focus: "SOL ecosystem, broad altcoin analysis" },
  { name: "Benjamin Cowen", youtube_handle: "@intothecryptoverse", subscribers: "817K", focus: "Quantitative cycle analysis, BTC/ETH/ADA/DOT" },
  { name: "CryptosRUs", youtube_handle: "@CryptosRUs", subscribers: "810K", focus: "Daily BTC/ETH updates, broad alt coverage" },
  { name: "Crypto Banter", youtube_handle: "@CryptoBanterGroup", subscribers: "795K", focus: "Live trade calls, daily market analysis" },
  { name: "Sheldon Evans", youtube_handle: "@SheldonEvansX", subscribers: "700K", focus: "Altcoin picks, sustainable investing approach" },
  { name: "The Moon Carl", youtube_handle: "@TheMoon", subscribers: "657K", focus: "Bold BTC price targets, TA-based calls" },
  { name: "Lark Davis", youtube_handle: "@TheCryptoLark", subscribers: "640K", focus: "Altcoin gems, SUI/NEAR, portfolio strategy" },
  { name: "DataDash", youtube_handle: "@DataDash", subscribers: "511K", focus: "Data-driven macro + crypto, LINK/DOT analysis" },
  { name: "InvestAnswers", youtube_handle: "@InvestAnswers", subscribers: "450K", focus: "Data-driven buy/sell calls with explicit targets" },
  { name: "Crypto Capital Venture", youtube_handle: "@CryptoCapitalVenture", subscribers: "402K", focus: "ADA champion, mid-cap alt predictions" },
  { name: "Austin Hilton", youtube_handle: "@AustinHilton", subscribers: "359K", focus: "Daily altcoin plays, DOGE, meme coins" },
  { name: "Michael Wrubel", youtube_handle: "@MichaelWrubel", subscribers: "315K", focus: "Undervalued alts, honest quick reviews" },
  { name: "Satoshi Stacker", youtube_handle: "@StackerSatoshi", subscribers: "300K", focus: "Daily BTC + altcoin picks, AI/gaming crypto" },
  { name: "Crypto Zombie", youtube_handle: "@CryptoZombie", subscribers: "263K", focus: "Daily altcoin alerts, specific entries" },
  { name: "Crypto Jebb", youtube_handle: "@CryptoJebb", subscribers: "248K", focus: "TA chart patterns, price targets" },
  { name: "Crypto Rover", youtube_handle: "@CryptoRover", subscribers: "210K", focus: "Daily BTC/SOL calls, altcoin analysis" },
  { name: "Miles Deutscher", youtube_handle: "@milesdeutscher1357", subscribers: "100K", focus: "Specific entries/exits, SUI/INJ/RENDER/FET" },
  { name: "Jacob Crypto Bury", youtube_handle: "@JacobCryptoBury", subscribers: "58K", focus: "Early small-cap gems, PENDLE/AR" },
] as const;

export const TRACKED_CREATOR_COUNT = TRACKED_CREATORS.length;
