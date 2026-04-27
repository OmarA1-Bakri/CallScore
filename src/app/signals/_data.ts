import { query } from "@/lib/db";
import type { ConsensusSignal } from "@/lib/types";

export interface SignalView extends ConsensusSignal {
  readonly creator_names: readonly string[];
  readonly status: "active" | "resolved";
  readonly conviction: number;
}

const MOCK_SIGNALS: readonly SignalView[] = [
  { id: 9001, symbol: "SOLUSDT", direction: "bullish", creator_count: 6, creator_ids: [1, 3, 6, 7, 9, 19], call_ids: [101, 102, 103], signal_date: "2026-04-20T00:00:00Z", avg_target_price: 212, price_at_signal: 146, price_7d: 158, price_30d: null, return_7d: 8.2, return_30d: null, correct: null, created_at: "2026-04-20T00:00:00Z", creator_names: ["Altcoin Daily", "Discover Crypto", "Crypto Banter", "Sheldon Evans"], status: "active", conviction: 82 },
  { id: 9002, symbol: "BTCUSDT", direction: "bearish", creator_count: 4, creator_ids: [4, 10, 11, 18], call_ids: [104, 105], signal_date: "2026-04-12T00:00:00Z", avg_target_price: 74000, price_at_signal: 89500, price_7d: 87200, price_30d: null, return_7d: 2.6, return_30d: null, correct: null, created_at: "2026-04-12T00:00:00Z", creator_names: ["Benjamin Cowen", "DataDash", "InvestAnswers", "Crypto Rover"], status: "active", conviction: 68 },
  { id: 9003, symbol: "ETHUSDT", direction: "bullish", creator_count: 5, creator_ids: [1, 5, 6, 12, 16], call_ids: [106, 107, 108], signal_date: "2026-03-01T00:00:00Z", avg_target_price: 4200, price_at_signal: 3100, price_7d: 3180, price_30d: 3625, return_7d: 2.6, return_30d: 16.9, correct: true, created_at: "2026-03-01T00:00:00Z", creator_names: ["Altcoin Daily", "CryptosRUs", "Crypto Banter", "Crypto Zombie"], status: "resolved", conviction: 74 },
] as const;

interface ConsensusRow extends ConsensusSignal {
  readonly creator_names: readonly string[] | null;
}

export async function getSignalViews(): Promise<readonly SignalView[]> {
  try {
    const rows = await query<ConsensusRow>(
      `SELECT cs.*, COALESCE(array_agg(c.name ORDER BY c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS creator_names
       FROM consensus_signals cs
       LEFT JOIN LATERAL unnest(cs.creator_ids) AS cid ON true
       LEFT JOIN creators c ON c.id = cid
       GROUP BY cs.id
       ORDER BY cs.signal_date DESC
       LIMIT 50`,
    );

    if (rows.length === 0) return MOCK_SIGNALS;

    return rows.map((row) => ({
      ...row,
      creator_names: row.creator_names ?? [],
      status: row.correct === null ? "active" : "resolved",
      conviction: Math.min(100, Math.round(row.creator_count * 12 + (row.return_7d ?? 0))),
    }));
  } catch {
    return MOCK_SIGNALS;
  }
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function signalFreshness(signalDate: string): { state: "hot" | "fresh" | "stale" | "fading"; label: string } {
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(signalDate).getTime()) / 86_400_000));
  if (ageDays <= 3) return { state: "hot", label: "forming" };
  if (ageDays <= 14) return { state: "fresh", label: "active" };
  if (ageDays <= 45) return { state: "fading", label: "maturing" };
  return { state: "stale", label: "resolved" };
}
