import type {
  Creator,
  CreatorStats,
  Call,
  ConsensusSignal,
  LeaderboardRow,
} from "./types";

// --- Creators ---

const MOCK_CREATORS: readonly Creator[] = [
  {
    id: 1, name: "CoinBureau Guy", youtube_handle: "coinbureau",
    youtube_channel_id: "UCqK_GSMbpiV8spgD3ZGloSw", subscribers: "2.4M",
    focus: "Research & Analysis", tier: "elite", total_calls: 87,
    win_rate: 72.4, avg_return: 18.3, alpha_score: 82,
    accuracy_rank: 1, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 2, name: "Benjamin Cowen", youtube_handle: "intothecryptoverse",
    youtube_channel_id: null, subscribers: "810K",
    focus: "Macro & On-chain", tier: "elite", total_calls: 63,
    win_rate: 68.2, avg_return: 15.1, alpha_score: 76,
    accuracy_rank: 2, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 3, name: "Lark Davis", youtube_handle: "thecryptonark",
    youtube_channel_id: null, subscribers: "500K",
    focus: "Altcoin Gems", tier: "elite", total_calls: 124,
    win_rate: 63.7, avg_return: 22.5, alpha_score: 71,
    accuracy_rank: 3, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 4, name: "DataDash Nicholas", youtube_handle: "datadash",
    youtube_channel_id: null, subscribers: "370K",
    focus: "Technical Analysis", tier: "elite", total_calls: 95,
    win_rate: 61.0, avg_return: 12.8, alpha_score: 67,
    accuracy_rank: 4, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 5, name: "Altcoin Daily", youtube_handle: "altcoindaily",
    youtube_channel_id: null, subscribers: "1.3M",
    focus: "Daily News & Picks", tier: "elite", total_calls: 210,
    win_rate: 59.5, avg_return: 9.7, alpha_score: 64,
    accuracy_rank: 5, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 6, name: "Crypto Banter", youtube_handle: "cryptobanter",
    youtube_channel_id: null, subscribers: "650K",
    focus: "Live Trading", tier: "pro", total_calls: 180,
    win_rate: 57.2, avg_return: 8.4, alpha_score: 59,
    accuracy_rank: 6, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 7, name: "Sheldon Evans", youtube_handle: "sheldonevans",
    youtube_channel_id: null, subscribers: "290K",
    focus: "DeFi & Layer 2s", tier: "pro", total_calls: 72,
    win_rate: 56.9, avg_return: 11.2, alpha_score: 57,
    accuracy_rank: 7, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 8, name: "Alex Becker", youtube_handle: "alexbecker",
    youtube_channel_id: null, subscribers: "1.0M",
    focus: "High-Risk Plays", tier: "pro", total_calls: 55,
    win_rate: 54.5, avg_return: 25.0, alpha_score: 54,
    accuracy_rank: 8, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 9, name: "EllioTrades", youtube_handle: "elliotrades",
    youtube_channel_id: null, subscribers: "340K",
    focus: "Narrative Plays", tier: "pro", total_calls: 89,
    win_rate: 52.8, avg_return: 7.1, alpha_score: 51,
    accuracy_rank: 9, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 10, name: "Crypto Jebb", youtube_handle: "cryptojebb",
    youtube_channel_id: null, subscribers: "210K",
    focus: "Chart Patterns", tier: "pro", total_calls: 143,
    win_rate: 51.0, avg_return: 5.8, alpha_score: 48,
    accuracy_rank: 10, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 11, name: "BitBoy Crypto", youtube_handle: "bitboy",
    youtube_channel_id: null, subscribers: "1.5M",
    focus: "Everything Crypto", tier: "free", total_calls: 320,
    win_rate: 48.4, avg_return: 2.1, alpha_score: 42,
    accuracy_rank: 11, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 12, name: "Crypto Zombie", youtube_handle: "cryptozombie",
    youtube_channel_id: null, subscribers: "250K",
    focus: "Mid-cap Alts", tier: "free", total_calls: 98,
    win_rate: 46.9, avg_return: 1.5, alpha_score: 39,
    accuracy_rank: 12, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 13, name: "Ivan on Tech", youtube_handle: "ivanontech",
    youtube_channel_id: null, subscribers: "490K",
    focus: "Tech & Fundamentals", tier: "free", total_calls: 156,
    win_rate: 45.5, avg_return: -0.8, alpha_score: 36,
    accuracy_rank: 13, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 14, name: "The Moon Carl", youtube_handle: "themooncrypto",
    youtube_channel_id: null, subscribers: "560K",
    focus: "Bitcoin & Moonshots", tier: "free", total_calls: 200,
    win_rate: 43.0, avg_return: -2.5, alpha_score: 33,
    accuracy_rank: 14, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 15, name: "Crypto FOMO", youtube_handle: "cryptofomo",
    youtube_channel_id: null, subscribers: "180K",
    focus: "Meme Coins", tier: "free", total_calls: 275,
    win_rate: 40.0, avg_return: -5.3, alpha_score: 28,
    accuracy_rank: 15, last_scraped_at: "2026-04-05T12:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  },
] as const;

// --- Creator Stats ---

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
    best_call_id: creator.id * 100 + 1,
    worst_call_id: creator.id * 100 + 2,
    hit_rate: creator.win_rate * 0.85,
    most_called_symbol: "SOLUSDT",
    strategy_consistency: 0.6 + Math.random() * 0.3,
    specificity_avg: 0.4 + Math.random() * 0.4,
    alpha_score: creator.alpha_score,
    accuracy_rank: rank,
    updated_at: "2026-04-05T12:00:00Z",
  };
}

// --- Mock Calls ---

const MOCK_CALLS: readonly Call[] = [
  {
    id: 101, creator_id: 1, video_id: 1001, symbol: "SOLUSDT",
    direction: "bullish", call_type: "buy", entry_price: 98.5,
    target_price: 150, stop_loss: 85, timeframe: "30d",
    confidence: "high", strategy_type: "fundamental",
    raw_quote: "I think Solana is massively undervalued right now. The ecosystem growth is incredible and we could easily see $150 within the next month.",
    extraction_confidence: 0.92, specificity_score: 1.0,
    call_date: "2026-02-15T10:00:00Z", price_at_call: 98.5,
    btc_price_at_call: 62000, price_7d: 112.3, price_30d: 148.7,
    price_90d: 165.2, btc_price_7d: 64500, btc_price_30d: 67000,
    btc_price_90d: 71000, return_7d: 14.0, return_30d: 51.0,
    return_90d: 67.7, alpha_7d: 10.0, alpha_30d: 42.9,
    alpha_90d: 53.2, hit_target: true, correct_direction: true,
    regime_at_call: 2, regime_difficulty: 0.3, score: 88.5,
    created_at: "2026-02-15T10:00:00Z",
  },
  {
    id: 102, creator_id: 1, video_id: 1002, symbol: "ETHUSDT",
    direction: "bullish", call_type: "buy", entry_price: 3200,
    target_price: 4000, stop_loss: 2900, timeframe: "90d",
    confidence: "high", strategy_type: "technical_analysis",
    raw_quote: "Ethereum looks ready for a breakout. The ETF flows are positive and the burn rate is accelerating.",
    extraction_confidence: 0.88, specificity_score: 1.0,
    call_date: "2026-01-20T14:00:00Z", price_at_call: 3200,
    btc_price_at_call: 58000, price_7d: 3350, price_30d: 3680,
    price_90d: 4120, btc_price_7d: 59500, btc_price_30d: 62000,
    btc_price_90d: 68000, return_7d: 4.7, return_30d: 15.0,
    return_90d: 28.8, alpha_7d: 2.1, alpha_30d: 8.1,
    alpha_90d: 11.5, hit_target: true, correct_direction: true,
    regime_at_call: 3, regime_difficulty: 0.5, score: 79.2,
    created_at: "2026-01-20T14:00:00Z",
  },
  {
    id: 103, creator_id: 1, video_id: 1003, symbol: "TAOUSDT",
    direction: "bullish", call_type: "buy", entry_price: 420,
    target_price: 700, stop_loss: 350, timeframe: "60d",
    confidence: "medium", strategy_type: "narrative",
    raw_quote: "TAO is the play for the AI narrative. It is the backbone of decentralized AI compute.",
    extraction_confidence: 0.85, specificity_score: 0.75,
    call_date: "2026-03-01T09:00:00Z", price_at_call: 420,
    btc_price_at_call: 65000, price_7d: 395, price_30d: 380,
    price_90d: null, btc_price_7d: 63000, btc_price_30d: 64000,
    btc_price_90d: null, return_7d: -5.9, return_30d: -9.5,
    return_90d: null, alpha_7d: -2.8, alpha_30d: -8.0,
    alpha_90d: null, hit_target: false, correct_direction: false,
    regime_at_call: 1, regime_difficulty: 0.2, score: 22.3,
    created_at: "2026-03-01T09:00:00Z",
  },
  {
    id: 104, creator_id: 1, video_id: 1004, symbol: "LINKUSDT",
    direction: "bullish", call_type: "buy", entry_price: 18.5,
    target_price: 25, stop_loss: 16, timeframe: "30d",
    confidence: "high", strategy_type: "fundamental",
    raw_quote: "Chainlink CCIP is going to be absolutely massive. Every institution needs it.",
    extraction_confidence: 0.90, specificity_score: 1.0,
    call_date: "2026-03-10T11:00:00Z", price_at_call: 18.5,
    btc_price_at_call: 66000, price_7d: 20.1, price_30d: 24.8,
    price_90d: null, btc_price_7d: 67500, btc_price_30d: 69000,
    btc_price_90d: null, return_7d: 8.6, return_30d: 34.0,
    return_90d: null, alpha_7d: 6.3, alpha_30d: 29.5,
    alpha_90d: null, hit_target: true, correct_direction: true,
    regime_at_call: 1, regime_difficulty: 0.2, score: 82.1,
    created_at: "2026-03-10T11:00:00Z",
  },
  {
    id: 105, creator_id: 1, video_id: 1005, symbol: "AVAXUSDT",
    direction: "bearish", call_type: "avoid", entry_price: 42,
    target_price: 30, stop_loss: 48, timeframe: "30d",
    confidence: "medium", strategy_type: "technical_analysis",
    raw_quote: "I'd avoid AVAX here. The chart is showing weakness and volume is declining.",
    extraction_confidence: 0.80, specificity_score: 0.75,
    call_date: "2026-02-28T16:00:00Z", price_at_call: 42,
    btc_price_at_call: 64500, price_7d: 39.2, price_30d: 35.1,
    price_90d: null, btc_price_7d: 63200, btc_price_30d: 66800,
    btc_price_90d: null, return_7d: -6.7, return_30d: -16.4,
    return_90d: null, alpha_7d: -4.7, alpha_30d: -19.9,
    alpha_90d: null, hit_target: true, correct_direction: true,
    regime_at_call: 2, regime_difficulty: 0.7, score: 75.8,
    created_at: "2026-02-28T16:00:00Z",
  },
  {
    id: 106, creator_id: 1, video_id: 1006, symbol: "SUIUSDT",
    direction: "bullish", call_type: "buy", entry_price: 1.8,
    target_price: 3.0, stop_loss: 1.5, timeframe: "60d",
    confidence: "high", strategy_type: "narrative",
    raw_quote: "SUI is the Move chain to watch. The TVL growth is parabolic and the gaming ecosystem is taking off.",
    extraction_confidence: 0.91, specificity_score: 1.0,
    call_date: "2026-01-10T08:00:00Z", price_at_call: 1.8,
    btc_price_at_call: 55000, price_7d: 2.1, price_30d: 2.75,
    price_90d: 3.4, btc_price_7d: 57000, btc_price_30d: 60000,
    btc_price_90d: 65000, return_7d: 16.7, return_30d: 52.8,
    return_90d: 88.9, alpha_7d: 13.0, alpha_30d: 43.7,
    alpha_90d: 70.7, hit_target: true, correct_direction: true,
    regime_at_call: 3, regime_difficulty: 0.5, score: 91.0,
    created_at: "2026-01-10T08:00:00Z",
  },
] as const;

// --- Consensus Signals ---

const MOCK_CONSENSUS: readonly ConsensusSignal[] = [
  {
    id: 1, symbol: "SOLUSDT", direction: "bullish", creator_count: 5,
    creator_ids: [1, 2, 3, 5, 6], call_ids: [101, 201, 301, 501, 601],
    signal_date: "2026-03-28T00:00:00Z", avg_target_price: 180,
    price_at_signal: 135, price_7d: 142, price_30d: null,
    return_7d: 5.2, return_30d: null, correct: null,
    created_at: "2026-03-28T00:00:00Z",
  },
  {
    id: 2, symbol: "LINKUSDT", direction: "bullish", creator_count: 4,
    creator_ids: [1, 2, 4, 7], call_ids: [104, 204, 404, 704],
    signal_date: "2026-03-20T00:00:00Z", avg_target_price: 28,
    price_at_signal: 22, price_7d: 24.5, price_30d: 27.8,
    return_7d: 11.4, return_30d: 26.4, correct: true,
    created_at: "2026-03-20T00:00:00Z",
  },
  {
    id: 3, symbol: "TAOUSDT", direction: "bullish", creator_count: 3,
    creator_ids: [1, 3, 8], call_ids: [103, 303, 803],
    signal_date: "2026-03-05T00:00:00Z", avg_target_price: 650,
    price_at_signal: 430, price_7d: 410, price_30d: 385,
    return_7d: -4.7, return_30d: -10.5, correct: false,
    created_at: "2026-03-05T00:00:00Z",
  },
  {
    id: 4, symbol: "RENDERUSDT", direction: "bullish", creator_count: 3,
    creator_ids: [2, 5, 6], call_ids: [205, 505, 605],
    signal_date: "2026-04-01T00:00:00Z", avg_target_price: 12,
    price_at_signal: 8.5, price_7d: 9.2, price_30d: null,
    return_7d: 8.2, return_30d: null, correct: null,
    created_at: "2026-04-01T00:00:00Z",
  },
] as const;

// --- Performance Chart Data ---

const MOCK_PERFORMANCE_DATA: readonly { date: string; score: number }[] = [
  { date: "Jan", score: 55 },
  { date: "Feb", score: 62 },
  { date: "Mar", score: 58 },
  { date: "Apr", score: 70 },
  { date: "May", score: 74 },
  { date: "Jun", score: 68 },
  { date: "Jul", score: 72 },
  { date: "Aug", score: 78 },
  { date: "Sep", score: 75 },
  { date: "Oct", score: 80 },
  { date: "Nov", score: 85 },
  { date: "Dec", score: 82 },
] as const;

// --- Leaderboard Rows ---

function buildLeaderboardRows(): readonly LeaderboardRow[] {
  return MOCK_CREATORS.map((creator, idx) => {
    const rank = idx + 1;
    const stats = makeStat(creator, rank);
    const tierRequired =
      rank <= 5 ? "elite" : rank <= 10 ? "pro" : "free";

    const bestCall =
      rank === 1
        ? MOCK_CALLS[0]
        : rank <= 6
          ? { ...MOCK_CALLS[0], id: rank * 100 + 1, return_30d: 40 - rank * 4 }
          : null;

    const trends: readonly ("up" | "down" | "stable")[] = [
      "up", "stable", "up", "down", "stable",
      "up", "down", "up", "stable", "down",
      "stable", "down", "down", "stable", "down",
    ];

    return {
      rank,
      creator,
      stats,
      best_call: bestCall as Call | null,
      worst_call: null,
      tier_required: tierRequired,
      trend: trends[idx] ?? "stable",
    };
  });
}

export const MOCK_LEADERBOARD_ROWS = buildLeaderboardRows();
export const MOCK_CREATOR = MOCK_CREATORS[0];
export const MOCK_CREATOR_STATS = makeStat(MOCK_CREATORS[0], 1);
export const MOCK_CALLS_LIST = MOCK_CALLS;
export const MOCK_CONSENSUS_SIGNALS = MOCK_CONSENSUS;
export const MOCK_PERFORMANCE = MOCK_PERFORMANCE_DATA;
export const MOCK_ALL_CREATORS = MOCK_CREATORS;
