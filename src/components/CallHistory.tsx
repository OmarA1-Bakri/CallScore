"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Target,
  X,
} from "lucide-react";
import { SYMBOL_TICKERS } from "@/lib/constants";
import type { Call } from "@/lib/types";

interface CallHistoryProps {
  readonly calls: readonly Call[];
}

type SortKey = "call_date" | "score" | "return_30d";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export default function CallHistory({ calls }: CallHistoryProps) {
  const [sortKey, setSortKey] = useState<SortKey>("call_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...calls];
    arr.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
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
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-brand-border">
        <h3 className="text-white font-semibold text-sm">Call History</h3>
        <p className="text-gray-500 text-xs mt-1">
          {calls.length} total calls tracked
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border">
              <SortableHeader
                label="Date"
                sortKey="call_date"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
                Coin
              </th>
              <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3">
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
              <th className="text-left text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                Alpha 30d
              </th>
              <th className="text-center text-gray-500 text-xs font-medium uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Target
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((call) => {
              const ticker =
                SYMBOL_TICKERS[call.symbol] ?? call.symbol.replace("USDT", "");

              return (
                <tr key={call.id} className="table-row-hover border-b border-brand-border/50">
                  <td className="px-4 py-3 text-gray-400 text-xs tabular-nums whitespace-nowrap">
                    {formatDate(call.call_date)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/call/${call.id}`}
                      className="text-white font-medium hover:text-brand-gold transition-colors"
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
                  <td className="px-4 py-3 text-white font-medium tabular-nums">
                    {call.score.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {call.return_30d !== null ? (
                      <span
                        className={
                          call.return_30d >= 0
                            ? "value-positive"
                            : "value-negative"
                        }
                      >
                        {call.return_30d >= 0 ? "+" : ""}
                        {call.return_30d.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums hidden lg:table-cell">
                    {call.alpha_30d !== null ? (
                      <span
                        className={
                          call.alpha_30d >= 0
                            ? "value-positive"
                            : "value-negative"
                        }
                      >
                        {call.alpha_30d >= 0 ? "+" : ""}
                        {call.alpha_30d.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {call.hit_target === true ? (
                      <Target className="w-4 h-4 text-brand-green mx-auto" />
                    ) : call.hit_target === false ? (
                      <X className="w-4 h-4 text-brand-red mx-auto" />
                    ) : (
                      <span className="text-gray-600">--</span>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-brand-border">
          <p className="text-gray-500 text-xs">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
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
        className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs font-medium uppercase tracking-wider transition-colors"
      >
        {label}
        <ArrowUpDown
          className={`w-3 h-3 ${isActive ? "text-brand-gold" : ""}`}
        />
        {isActive && (
          <span className="text-brand-gold text-[8px]">
            {currentDir === "asc" ? "ASC" : "DESC"}
          </span>
        )}
      </button>
    </th>
  );
}
