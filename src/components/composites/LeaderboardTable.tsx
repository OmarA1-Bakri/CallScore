import Link from "next/link";
import {
  AlphaScore,
  Badge,
  DirChip,
  LowNBadge,
  Provenance,
  Rank,
  RankTierBadge,
  Token,
} from "@/components/primitives";
import type { LeaderboardRow } from "@/lib/types";

interface LeaderboardTableProps {
  readonly rows: readonly LeaderboardRow[];
}

function toRankTier(rank: number): "S" | "A" | "B" | "C" | "D" {
  if (rank <= 3) return "S";
  if (rank <= 10) return "A";
  if (rank <= 25) return "B";
  if (rank <= 50) return "C";
  return "D";
}

function directionFromPct(bullishPct: number): "long" | "short" | "neutral" {
  if (bullishPct >= 60) return "long";
  if (bullishPct <= 40) return "short";
  return "neutral";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function handleForUrl(handle: string): string {
  return handle.replace(/^@/, "");
}

export default function LeaderboardTable({ rows }: LeaderboardTableProps) {
  if (rows.length === 0) {
    return (
      <div className="leaderboard-empty">
        <span className="shell-square" aria-hidden="true" />
        <p>Leaderboard data is being computed. Run the data pipeline to populate scores.</p>
      </div>
    );
  }

  return (
    <div className="leaderboard-table-wrap">
      <table className="leaderboard-table">
        <caption>Creator leaderboard ranked by Alpha Score.</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Creator</th>
            <th scope="col">α</th>
            <th scope="col">Win</th>
            <th scope="col">N</th>
            <th scope="col">Bias</th>
            <th scope="col">Best source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const creatorHref = `/creator/${handleForUrl(row.creator.youtube_handle)}`;
            const rankTier = toRankTier(row.rank);
            const sampleLow = row.stats.total_calls < 20;
            return (
              <tr key={row.creator.id}>
                <td><Rank value={row.rank} /></td>
                <td>
                  <div className="creator-cell">
                    <Link href={creatorHref}>{row.creator.name}</Link>
                    <span>{row.creator.youtube_handle}</span>
                    <div>
                      <RankTierBadge tier={rankTier} />
                      {row.creator.focus ? <Badge>{row.creator.focus}</Badge> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <AlphaScore
                    value={row.stats.alpha_score}
                    window={row.stats.period === "all_time" ? "all" : row.stats.period}
                    confidence={sampleLow ? "low" : "normal"}
                    peerMedian={0}
                  />
                </td>
                <td className="tabular-cell">{formatPercent(row.stats.win_rate)}</td>
                <td>{sampleLow ? <LowNBadge n={row.stats.total_calls} /> : <Badge tone="neutral">N · {row.stats.total_calls}</Badge>}</td>
                <td><DirChip direction={directionFromPct(row.stats.bullish_pct)} /></td>
                <td>
                  {row.best_call ? (
                    <div className="source-cell">
                      <Token symbol={row.best_call.symbol} />
                      <Provenance href={`/call/${row.best_call.id}`} label="best call" />
                    </div>
                  ) : (
                    <Badge tone="lock">pending</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
