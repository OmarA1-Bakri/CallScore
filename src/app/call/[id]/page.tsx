import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Quote } from "lucide-react";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { query } from "@/lib/db";
import {
  SYMBOL_NAMES,
  SYMBOL_TICKERS,
  REGIME_LABELS,
  REGIME_COLORS,
} from "@/lib/constants";
import type { Call, Creator } from "@/lib/types";

interface PageProps {
  readonly params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const callId = parseInt(params.id, 10);
  if (isNaN(callId)) {
    return { title: "Call Not Found | CryptoTubers Ranked" };
  }

  try {
    const calls = await query<Call>(
      `SELECT * FROM calls WHERE id = $1 LIMIT 1`,
      [callId],
    );

    if (calls.length === 0) {
      return { title: "Call Not Found | CryptoTubers Ranked" };
    }

    const call = calls[0];
    const ticker = SYMBOL_TICKERS[call.symbol] ?? call.symbol.replace("USDT", "");
    const direction = call.direction.charAt(0).toUpperCase() + call.direction.slice(1);

    return {
      title: `${ticker} ${direction} Call — CryptoTubers Ranked`,
      description: `Detailed breakdown of this ${ticker} ${call.direction} call: score ${call.score.toFixed(1)}/100, direction ${call.correct_direction ? "correct" : "wrong"}, with full alpha and regime analysis.`,
      alternates: { canonical: `/call/${params.id}` },
    };
  } catch {
    return { title: "Call Not Found | CryptoTubers Ranked" };
  }
}

export default async function CallDetailPage({ params }: PageProps) {
  const callId = parseInt(params.id, 10);
  if (isNaN(callId)) {
    notFound();
  }

  let call: Call;
  try {
    const calls = await query<Call>(
      `SELECT * FROM calls WHERE id = $1 LIMIT 1`,
      [callId],
    );
    if (calls.length === 0) {
      notFound();
    }
    call = calls[0];
  } catch {
    notFound();
  }

  let creator: Creator | null = null;
  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE id = $1 LIMIT 1`,
      [call.creator_id],
    );
    creator = creators.length > 0 ? creators[0] : null;
  } catch {
    // Creator table may not exist yet
  }

  const creatorName = creator?.name ?? "Unknown Creator";
  const creatorHandle = creator?.youtube_handle ?? "unknown";

  const ticker = SYMBOL_TICKERS[call.symbol] ?? call.symbol.replace("USDT", "");
  const coinName = SYMBOL_NAMES[call.symbol] ?? call.symbol;
  const isBullish = call.direction === "bullish";
  const regimeLabel = call.regime_at_call !== null
    ? REGIME_LABELS[call.regime_at_call] ?? "Unknown"
    : "Unknown";
  const regimeColor = call.regime_at_call !== null
    ? REGIME_COLORS[call.regime_at_call] ?? "#6b7280"
    : "#6b7280";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href={`/creator/${creatorHandle}`}
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {creatorName}
      </Link>

      {/* Header */}
      <section className="glass-card p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="flex-1">
            <p className="text-gray-500 text-sm mb-1">
              {creatorName} &middot;{" "}
              {new Date(call.call_date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <h1 className="text-2xl font-bold text-white">
              {ticker} --{" "}
              <span className={isBullish ? "text-brand-green" : "text-brand-red"}>
                {call.direction.charAt(0).toUpperCase() + call.direction.slice(1)}
              </span>{" "}
              Call
            </h1>
          </div>
          <div
            className={`text-3xl font-bold tabular-nums ${
              call.score >= 60
                ? "text-brand-green"
                : call.score >= 40
                  ? "text-yellow-400"
                  : "text-brand-red"
            }`}
          >
            {call.score.toFixed(1)}
          </div>
        </div>

        {/* The call summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <MiniStat label="Coin" value={`${coinName} (${ticker})`} />
          <MiniStat
            label="Direction"
            value={call.direction}
            badge={isBullish ? "bullish" : "bearish"}
          />
          <MiniStat
            label="Entry Price"
            value={call.entry_price !== null ? `$${call.entry_price.toLocaleString()}` : "--"}
          />
          <MiniStat
            label="Target Price"
            value={call.target_price !== null ? `$${call.target_price.toLocaleString()}` : "--"}
          />
          <MiniStat
            label="Stop Loss"
            value={call.stop_loss !== null ? `$${call.stop_loss.toLocaleString()}` : "--"}
          />
          <MiniStat label="Timeframe" value={call.timeframe ?? "--"} />
          <MiniStat label="Confidence" value={call.confidence ?? "--"} />
          <MiniStat label="Strategy" value={call.strategy_type?.replace("_", " ") ?? "--"} />
        </div>
      </section>

      {/* Price performance */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <PriceCard
          label="7 Days"
          priceAfter={call.price_7d}
          returnPct={call.return_7d}
          alphaPct={call.alpha_7d}
          btcReturn={call.btc_price_at_call && call.btc_price_7d
            ? ((call.btc_price_7d - call.btc_price_at_call) / call.btc_price_at_call) * 100
            : null}
        />
        <PriceCard
          label="30 Days"
          priceAfter={call.price_30d}
          returnPct={call.return_30d}
          alphaPct={call.alpha_30d}
          btcReturn={call.btc_price_at_call && call.btc_price_30d
            ? ((call.btc_price_30d - call.btc_price_at_call) / call.btc_price_at_call) * 100
            : null}
        />
        <PriceCard
          label="90 Days"
          priceAfter={call.price_90d}
          returnPct={call.return_90d}
          alphaPct={call.alpha_90d}
          btcReturn={call.btc_price_at_call && call.btc_price_90d
            ? ((call.btc_price_90d - call.btc_price_at_call) / call.btc_price_at_call) * 100
            : null}
        />
      </section>

      {/* Score breakdown + Market regime */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <ScoreBreakdown
          direction={call.correct_direction ? 40 : 0}
          alpha={Math.min(25, Math.max(0, (call.alpha_30d ?? 0) * 2.5))}
          specificity={call.specificity_score * 15}
          regime={call.regime_difficulty * 10}
          target={call.hit_target ? 10 : 0}
        />

        <div className="glass-card p-5">
          <h2 className="text-white font-semibold text-sm mb-4">
            Market Context
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                Market Regime at Call
              </p>
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: regimeColor }}
                />
                <span className="text-white font-medium text-sm">
                  {regimeLabel}
                </span>
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                Regime Difficulty
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-brand-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full"
                    style={{ width: `${call.regime_difficulty * 100}%` }}
                  />
                </div>
                <span className="text-gray-300 text-xs tabular-nums">
                  {(call.regime_difficulty * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                Direction Correct
              </p>
              <span
                className={`text-sm font-semibold ${
                  call.correct_direction ? "text-brand-green" : "text-brand-red"
                }`}
              >
                {call.correct_direction ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                Hit Target
              </p>
              <span
                className={`text-sm font-semibold ${
                  call.hit_target ? "text-brand-green" : "text-brand-red"
                }`}
              >
                {call.hit_target ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Raw quote */}
      {call.raw_quote && (
        <section className="mb-8">
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Quote className="w-5 h-5 text-brand-gold" />
              <h2 className="text-white font-semibold text-sm">
                From the Transcript
              </h2>
            </div>
            <blockquote className="border-l-2 border-brand-gold/40 pl-4 text-gray-300 text-sm leading-relaxed italic">
              &ldquo;{call.raw_quote}&rdquo;
            </blockquote>
            <p className="text-gray-600 text-xs mt-3">
              Extraction confidence: {(call.extraction_confidence * 100).toFixed(0)}%
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

interface MiniStatProps {
  readonly label: string;
  readonly value: string;
  readonly badge?: "bullish" | "bearish";
}

function MiniStat({ label, value, badge }: MiniStatProps) {
  return (
    <div>
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
        {label}
      </p>
      {badge ? (
        <span className={badge === "bullish" ? "badge-bullish" : "badge-bearish"}>
          {value}
        </span>
      ) : (
        <p className="text-white text-sm font-medium capitalize">{value}</p>
      )}
    </div>
  );
}

interface PriceCardProps {
  readonly label: string;
  readonly priceAfter: number | null;
  readonly returnPct: number | null;
  readonly alphaPct: number | null;
  readonly btcReturn: number | null;
}

function PriceCard({
  label,
  priceAfter,
  returnPct,
  alphaPct,
  btcReturn,
}: PriceCardProps) {
  const hasData = priceAfter !== null && returnPct !== null;

  return (
    <div className="glass-card p-4">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">
        {label}
      </p>
      {hasData ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Price</span>
            <span className="text-white text-sm tabular-nums">
              ${priceAfter.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-xs">Return</span>
            <span
              className={`text-sm font-bold tabular-nums ${
                returnPct >= 0 ? "value-positive" : "value-negative"
              }`}
            >
              {returnPct >= 0 ? "+" : ""}
              {returnPct.toFixed(1)}%
            </span>
          </div>
          {btcReturn !== null && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">BTC Return</span>
              <span className="text-gray-300 text-sm tabular-nums">
                {btcReturn >= 0 ? "+" : ""}
                {btcReturn.toFixed(1)}%
              </span>
            </div>
          )}
          {alphaPct !== null && (
            <div className="flex items-center justify-between border-t border-brand-border pt-2">
              <span className="text-gray-400 text-xs font-medium">Alpha</span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  alphaPct >= 0 ? "value-positive" : "value-negative"
                }`}
              >
                {alphaPct >= 0 ? "+" : ""}
                {alphaPct.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">Not yet available</p>
      )}
    </div>
  );
}
