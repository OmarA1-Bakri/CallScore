import type {
  Creator,
  CreatorStats,
  LeaderboardRow,
} from "./types";

/**
 * Mock data matching the real 20 creators from seed-creators.ts.
 * Used as fallback when the database is not yet populated,
 * or for local development without DB access.
 */

const MOCK_CREATORS: readonly Creator[] = [
  {
    id: 1, name: "Altcoin Daily", youtube_handle: "@AltcoinDaily",
    youtube_channel_id: null, subscribers: "1.65M",
    focus: "Daily altcoin picks, BTC/ETH/ADA/SOL, AI tokens", tier: "elite",
    total_calls: 210, win_rate: 59.5, avg_return: 9.7, alpha_score: 64,
    accuracy_rank: 1, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 2, name: "Alex Becker", youtube_handle: "@AlexBeckersChannel",
    youtube_channel_id: null, subscribers: "1.6M",
    focus: "Bold altcoin calls, AI crypto (RENDER, FET, TAO)", tier: "elite",
    total_calls: 55, win_rate: 54.5, avg_return: 25.0, alpha_score: 59,
    accuracy_rank: 2, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 3, name: "Discover Crypto", youtube_handle: "@DiscoverCrypto_",
    youtube_channel_id: null, subscribers: "1.4M",
    focus: "SOL ecosystem, broad altcoin analysis", tier: "elite",
    total_calls: 180, win_rate: 57.2, avg_return: 8.4, alpha_score: 54,
    accuracy_rank: 3, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 4, name: "Benjamin Cowen", youtube_handle: "@intothecryptoverse",
    youtube_channel_id: null, subscribers: "817K",
    focus: "Quantitative cycle analysis, BTC/ETH/ADA/DOT", tier: "elite",
    total_calls: 63, win_rate: 68.2, avg_return: 15.1, alpha_score: 52,
    accuracy_rank: 4, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 5, name: "CryptosRUs", youtube_handle: "@CryptosRUs",
    youtube_channel_id: null, subscribers: "810K",
    focus: "Daily BTC/ETH updates, broad alt coverage", tier: "elite",
    total_calls: 156, win_rate: 45.5, avg_return: -0.8, alpha_score: 51,
    accuracy_rank: 5, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 6, name: "Crypto Banter", youtube_handle: "@CryptoBanterGroup",
    youtube_channel_id: null, subscribers: "795K",
    focus: "Live trade calls, daily market analysis", tier: "pro",
    total_calls: 180, win_rate: 57.2, avg_return: 8.4, alpha_score: 48,
    accuracy_rank: 6, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 7, name: "Sheldon Evans", youtube_handle: "@SheldonEvansX",
    youtube_channel_id: null, subscribers: "700K",
    focus: "Altcoin picks, sustainable investing approach", tier: "pro",
    total_calls: 124, win_rate: 63.7, avg_return: 22.5, alpha_score: 46,
    accuracy_rank: 7, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 8, name: "The Moon Carl", youtube_handle: "@TheMoon",
    youtube_channel_id: null, subscribers: "657K",
    focus: "Bold BTC price targets, TA-based calls", tier: "pro",
    total_calls: 200, win_rate: 43.0, avg_return: -2.5, alpha_score: 44,
    accuracy_rank: 8, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 9, name: "Lark Davis", youtube_handle: "@TheCryptoLark",
    youtube_channel_id: null, subscribers: "640K",
    focus: "Altcoin gems, SUI/NEAR, portfolio strategy", tier: "pro",
    total_calls: 89, win_rate: 52.8, avg_return: 7.1, alpha_score: 42,
    accuracy_rank: 9, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 10, name: "DataDash", youtube_handle: "@DataDash",
    youtube_channel_id: null, subscribers: "511K",
    focus: "Data-driven macro + crypto, LINK/DOT analysis", tier: "pro",
    total_calls: 95, win_rate: 61.0, avg_return: 12.8, alpha_score: 39,
    accuracy_rank: 10, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 11, name: "InvestAnswers", youtube_handle: "@InvestAnswers",
    youtube_channel_id: null, subscribers: "450K",
    focus: "Data-driven buy/sell calls with explicit targets", tier: "free",
    total_calls: 88, win_rate: 58.5, avg_return: 10.5, alpha_score: 38,
    accuracy_rank: 11, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 12, name: "Crypto Capital Venture", youtube_handle: "@CryptoCapitalVenture",
    youtube_channel_id: null, subscribers: "402K",
    focus: "ADA champion, mid-cap alt predictions", tier: "free",
    total_calls: 95, win_rate: 61.0, avg_return: 12.8, alpha_score: 36,
    accuracy_rank: 12, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 13, name: "Austin Hilton", youtube_handle: "@AustinHilton",
    youtube_channel_id: null, subscribers: "359K",
    focus: "Daily altcoin plays, DOGE, meme coins", tier: "free",
    total_calls: 143, win_rate: 51.0, avg_return: 5.8, alpha_score: 34,
    accuracy_rank: 13, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 14, name: "Michael Wrubel", youtube_handle: "@MichaelWrubel",
    youtube_channel_id: null, subscribers: "315K",
    focus: "Undervalued alts, honest quick reviews", tier: "free",
    total_calls: 143, win_rate: 51.0, avg_return: 5.8, alpha_score: 32,
    accuracy_rank: 14, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 15, name: "Satoshi Stacker", youtube_handle: "@StackerSatoshi",
    youtube_channel_id: null, subscribers: "300K",
    focus: "Daily BTC + altcoin picks, AI/gaming crypto", tier: "free",
    total_calls: 98, win_rate: 46.9, avg_return: 1.5, alpha_score: 30,
    accuracy_rank: 15, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 16, name: "Crypto Zombie", youtube_handle: "@CryptoZombie",
    youtube_channel_id: null, subscribers: "263K",
    focus: "Daily altcoin alerts, specific entries", tier: "free",
    total_calls: 98, win_rate: 46.9, avg_return: 1.5, alpha_score: 28,
    accuracy_rank: 16, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 17, name: "Crypto Jebb", youtube_handle: "@CryptoJebb",
    youtube_channel_id: null, subscribers: "248K",
    focus: "TA chart patterns, price targets", tier: "free",
    total_calls: 143, win_rate: 51.0, avg_return: 5.8, alpha_score: 26,
    accuracy_rank: 17, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 18, name: "Crypto Rover", youtube_handle: "@CryptoRover",
    youtube_channel_id: null, subscribers: "210K",
    focus: "Daily BTC/SOL calls, altcoin analysis", tier: "free",
    total_calls: 156, win_rate: 45.5, avg_return: -0.8, alpha_score: 24,
    accuracy_rank: 18, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 19, name: "Miles Deutscher", youtube_handle: "@milesdeutscher1357",
    youtube_channel_id: null, subscribers: "100K",
    focus: "Specific entries/exits, SUI/INJ/RENDER/FET", tier: "free",
    total_calls: 72, win_rate: 56.9, avg_return: 11.2, alpha_score: 22,
    accuracy_rank: 19, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 20, name: "Jacob Crypto Bury", youtube_handle: "@JacobCryptoBury",
    youtube_channel_id: null, subscribers: "58K",
    focus: "Early small-cap gems, PENDLE/AR", tier: "free",
    total_calls: 72, win_rate: 56.9, avg_return: 11.2, alpha_score: 20,
    accuracy_rank: 20, last_scraped_at: null, created_at: "2025-01-01T00:00:00Z",
  },
] as const;

function makeStat(creator: Creator, rank: number): CreatorStats {
  return {
    id: creator.id,
    creator_id: creator.id,
    period: "all_time",
    total_calls: creator.total_calls,
    win_rate: creator.win_rate,
    avg_return_7d: creator.avg_return * 0.3,
    avg_return_30d: creator.avg_return,
    avg_return_90d: creator.avg_return * 2.1,
    avg_alpha_30d: creator.avg_return - 3.2,
    best_call_id: null,
    worst_call_id: null,
    hit_rate: creator.win_rate * 0.85,
    most_called_symbol: "SOLUSDT",
    strategy_consistency: 0.7,
    specificity_avg: 0.6,
    alpha_score: creator.alpha_score,
    accuracy_rank: rank,
    updated_at: "2026-04-05T12:00:00Z",
  };
}

function buildLeaderboardRows(): readonly LeaderboardRow[] {
  return MOCK_CREATORS.map((creator, idx) => {
    const rank = idx + 1;
    const stats = makeStat(creator, rank);
    const tierRequired =
      rank <= 5 ? "elite" : rank <= 10 ? "pro" : "free";

    const trends: readonly ("up" | "down" | "stable")[] = [
      "up", "stable", "up", "down", "stable",
      "up", "down", "up", "stable", "down",
      "stable", "down", "down", "stable", "down",
      "up", "down", "stable", "down", "stable",
    ];

    return {
      rank,
      creator,
      stats,
      best_call: null,
      worst_call: null,
      tier_required: tierRequired,
      trend: trends[idx] ?? "stable",
    };
  });
}

export const MOCK_LEADERBOARD_ROWS = buildLeaderboardRows();
export const MOCK_ALL_CREATORS = MOCK_CREATORS;
