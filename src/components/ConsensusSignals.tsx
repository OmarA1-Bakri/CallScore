"use client";

import { Zap, TrendingUp, TrendingDown } from "lucide-react";
import type { ConsensusSignal } from "@/lib/types";
import { SYMBOL_TICKERS } from "@/lib/constants";

interface ConsensusSignalsProps {
  readonly signals: readonly ConsensusSignal[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ConsensusSignals({ signals }: ConsensusSignalsProps) {
  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-accent" />
        <h3 className="text-white font-semibold text-sm">Consensus Signals</h3>
        <span className="badge-elite ml-auto">Alpha</span>
      </div>

      {/* Signal list */}
      {signals.length === 0 ? (
        <p className="text-gray-500 text-sm">No recent consensus signals.</p>
      ) : (
        <div className="space-y-3">
          {signals.map((signal) => {
            const ticker = SYMBOL_TICKERS[signal.symbol] ?? signal.symbol;
            const isBullish = signal.direction === "bullish";

            return (
              <div
                key={signal.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-ink-0/50 border border-ink-200"
              >
                {/* Direction icon */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isBullish ? "bg-pos/10" : "bg-neg/10"
                  }`}
                >
                  {isBullish ? (
                    <TrendingUp className="w-4 h-4 text-pos" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-neg" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm">
                      {ticker}
                    </span>
                    <span
                      className={
                        isBullish ? "badge-bullish" : "badge-bearish"
                      }
                    >
                      {signal.direction}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs">
                    {signal.creator_count} creators &middot;{" "}
                    {formatDate(signal.signal_date)}
                  </p>
                </div>

                {/* Return outcome */}
                {signal.return_30d !== null && (
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      signal.return_30d >= 0 ? "value-positive" : "value-negative"
                    }`}
                  >
                    {signal.return_30d >= 0 ? "+" : ""}
                    {signal.return_30d.toFixed(1)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
