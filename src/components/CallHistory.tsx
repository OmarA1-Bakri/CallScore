"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SYMBOL_TICKERS } from "@/lib/constants";
import type { SerializedCall } from "@/lib/public-serializer";

interface CallHistoryProps {
  readonly calls: readonly SerializedCall[];
  readonly totalCount?: number;
  readonly scoredCount?: number;
}

type SortKey = "call_date" | "score" | "return_30d";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function getScoreLabel(call: SerializedCall): string {
  if (call.score_status === "scored") {
    return (call.public_score ?? 0).toFixed(1);
  }
  if (call.score_status === "excluded_confidence") return "Unscored";
  if (call.score_status === "invalid_extraction") return "Invalid";
  if (call.horizon_status_30d === "pending") return "Pending 30d";
  if (call.target_status === "pending" || call.horizon_status_90d === "pending") return "Pending 90d";
  return "Pending";
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export default function CallHistory({
  calls,
  totalCount,
  scoredCount,
}: CallHistoryProps) {
  const [sortKey, setSortKey] = useState<SortKey>("call_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...calls];
    arr.sort((a, b) => {
      const aVal =
        sortKey === "score"
          ? (a.public_score ?? -1)
          : sortKey === "return_30d"
            ? (a.return_30d ?? a.live_return ?? 0)
          : (a[sortKey] ?? 0);
      const bVal =
        sortKey === "score"
          ? (b.public_score ?? -1)
          : sortKey === "return_30d"
            ? (b.return_30d ?? b.live_return ?? 0)
          : (b[sortKey] ?? 0);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const numA = typeof aVal === "number" ? aVal : 0;
      const numB = typeof bVal === "number" ? bVal : 0;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
    return arr;
  }, [calls, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  }

  return (
    <div className="border border-ink-200 overflow-hidden">
      <div className="p-4 border-b border-ink-200">
        <h2 className="text-ink-900 font-semibold text-sm">Recent call history</h2>
        <p className="text-ink-500 text-xs mt-1">
          {totalCount !== undefined
            ? `Showing ${calls.length} of ${totalCount} tracked calls`
            : `Showing ${calls.length} tracked calls`}
          {scoredCount !== undefined ? ` · ${scoredCount} public-scored` : ""}
          {" · Last 12 months"}
        </p>
      </div>

      <div
        className="overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        tabIndex={0}
        aria-label="Creator call history table"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200">
              <SortableHeader
                label="Date"
                sortKey="call_date"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <th className="text-left text-ink-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
                Coin
              </th>
              <th className="text-left text-ink-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
                Direction
              </th>
              <SortableHeader
                label="Score"
                sortKey="score"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader
                label="Return 30d"
                sortKey="return_30d"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <th className="text-left text-ink-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                Alpha 30d
              </th>
              <th className="text-center text-ink-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Target
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((call) => {
              const ticker =
                SYMBOL_TICKERS[call.symbol] ?? call.symbol.replace("USDT", "");

              return (
                <tr key={call.id} className="table-row-hover border-b border-ink-200/50">
                  <td className="px-4 py-3 text-ink-600 text-xs tabular-nums whitespace-nowrap">
                    {formatDate(call.call_date)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/call/${call.id}`}
                      aria-label={`View ${ticker} ${call.direction} call details`}
                      className="text-ink-900 font-medium hover:text-accent transition-colors"
                    >
                      {ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        call.direction === "bullish"
                          ? "badge-bullish"
                          : call.direction === "bearish"
                            ? "badge-bearish"
                            : "badge-neutral"
                      }
                    >
                      {call.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-900 font-medium tabular-nums">
                    <span
                      className={
                        call.score_status === "scored"
                          ? "text-ink-900"
                          : "text-ink-500 text-xs uppercase tracking-wider"
                      }
                    >
                      {getScoreLabel(call)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {call.horizon_status_30d === "pending" && call.live_return !== null ? (
                      <span
                        className={
                          call.live_return >= 0
                            ? "value-positive"
                            : "value-negative"
                        }
                      >
                        {formatSignedPercent(call.live_return)}
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-ink-600">
                          Live 30d
                        </span>
                      </span>
                    ) : call.horizon_status_30d === "pending" ? (
                      <span className="text-xs uppercase tracking-wider text-ink-600">
                        Pending 30d
                      </span>
                    ) : call.return_30d !== null ? (
                      <span
                        className={
                          call.return_30d >= 0
                            ? "value-positive"
                            : "value-negative"
                        }
                      >
                        {formatSignedPercent(call.return_30d)}
                      </span>
                    ) : (
                      <span className="text-ink-600">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums hidden lg:table-cell">
                    {call.horizon_status_30d === "pending" && call.live_alpha !== null ? (
                      <span
                        className={
                          call.live_alpha >= 0
                            ? "value-positive"
                            : "value-negative"
                        }
                      >
                        {formatSignedPercent(call.live_alpha)}
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-ink-600">
                          Live 30d
                        </span>
                      </span>
                    ) : call.horizon_status_30d === "pending" ? (
                      <span className="text-xs uppercase tracking-wider text-ink-600">
                        Pending 30d
                      </span>
                    ) : call.alpha_30d !== null ? (
                      <span
                        className={
                          call.alpha_30d >= 0
                            ? "value-positive"
                            : "value-negative"
                        }
                      >
                        {formatSignedPercent(call.alpha_30d)}
                      </span>
                    ) : (
                      <span className="text-ink-600">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {call.validated_target_price === null ? (
                      <span className="text-ink-600">--</span>
                    ) : call.target_status === "pending" ? (
                      <span className="text-xs uppercase tracking-wider text-ink-600">
                        Pending 90d
                      </span>
                    ) : call.hit_target === true ? (
                      <span aria-label="Target hit" role="img" className="text-pos">✓</span>
                    ) : call.hit_target === false ? (
                      <span aria-label="Target missed" role="img" className="text-neg">✕</span>
                    ) : (
                      <span className="text-ink-600">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-ink-200">
          <p className="text-ink-500 text-xs">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="px-2 py-1 text-ink-600 hover:text-ink-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="px-2 py-1 text-ink-600 hover:text-ink-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SortableHeaderProps {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly currentKey: SortKey;
  readonly currentDir: SortDir;
  readonly onSort: (key: SortKey) => void;
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: SortableHeaderProps) {
  const isActive = currentKey === sortKey;

  return (
    <th className="text-left px-4 py-3">
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 text-ink-500 hover:text-ink-700 text-xs font-medium uppercase tracking-wider transition-colors"
      >
        {label}
        <span
          aria-hidden="true"
          className={isActive ? "text-accent" : "text-ink-600"}
        >
          ⇅
        </span>
        {isActive && (
          <span className="text-accent text-[9px]">
            {currentDir === "asc" ? "ASC" : "DESC"}
          </span>
        )}
      </button>
    </th>
  );
}
