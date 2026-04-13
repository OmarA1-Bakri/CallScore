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
import { serializeCall } from "@/lib/public-serializer";
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

    const call = serializeCall(calls[0]);
    const ticker = SYMBOL_TICKERS[call.symbol] ?? call.symbol.replace("USDT", "");
    const direction = call.direction.charAt(0).toUpperCase() + call.direction.slice(1);
    const scoreText =
      call.public_score !== null ? `${call.public_score.toFixed(1)}/100` : call.score_status;

    return {
      title: `${ticker} ${direction} Call — CryptoTubers Ranked`,
      description: `Detailed breakdown of this ${ticker} ${call.direction} call: ${scoreText}, direction ${call.correct_direction ? "correct" : "wrong"}, with full alpha and regime analysis.`,
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

  const serializedCall = serializeCall(call);
  const creatorName = creator?.name ?? "Unknown Creator";
  const creatorHandle = creator?.youtube_handle ?? "unknown";

  const ticker = SYMBOL_TICKERS[serializedCall.symbol] ?? serializedCall.symbol.replace("USDT", "");
  const coinName = SYMBOL_NAMES[serializedCall.symbol] ?? serializedCall.symbol;
  const isBullish = serializedCall.direction === "bullish";
  const regimeLabel = serializedCall.regime_at_call !== null
    ? REGIME_LABELS[serializedCall.regime_at_call] ?? "Unknown"
    : "Unknown";
  const regimeColor = serializedCall.regime_at_call !== null
    ? REGIME_COLORS[serializedCall.regime_at_call] ?? "#6b7280"
    : "#6b7280";
  const displayScore = serializedCall.public_score;
  const scoreLabel =
    serializedCall.score_status === "scored"
      ? "Alpha Score"
      : serializedCall.score_status === "pending_horizon"
        ? "Status"
        : "Call Status";
  const scoreValue =
    serializedCall.score_status === "scored"
      ? displayScore!.toFixed(1)
      : serializedCall.score_status === "excluded_confidence"
        ? "Unscored"
        : serializedCall.score_status === "invalid_extraction"
          ? "Invalid"
          : "Pending";

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
              {new Date(serializedCall.call_date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <h1 className="text-2xl font-bold text-white">
              {ticker} --{" "}
              <span className={isBullish ? "text-brand-green" : "text-brand-red"}>
                {serializedCall.direction.charAt(0).toUpperCase() + serializedCall.direction.slice(1)}
              </span>{" "}
              Call
            </h1>
          </div>
          <div
            className={`text-3xl font-bold tabular-nums ${
              serializedCall.score_status !== "scored"
                ? "text-gray-400"
                : displayScore! >= 60
                ? "text-brand-green"
                : displayScore! >= 40
                  ? "text-yellow-400"
                  : "text-brand-red"
            }`}
            aria-label={scoreLabel}
          >
            {scoreValue}
          </div>
        </div>

        {/* The call summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <MiniStat label="Coin" value={`${coinName} (${ticker})`} />
          <MiniStat
            label="Direction"
            value={serializedCall.direction}
            badge={isBullish ? "bullish" : "bearish"}
          />
          <MiniStat
            label="Entry Price"
            value={serializedCall.entry_price !== null ? `$${serializedCall.entry_price.toLocaleString()}` : "--"}
          />
          <MiniStat
            label="Target Price"
            value={serializedCall.target_price !== null ? `$${serializedCall.target_price.toLocaleString()}` : "--"}
          />
          <MiniStat
            label="Stop Loss"
            value={serializedCall.stop_loss !== null ? `$${serializedCall.stop_loss.toLocaleString()}` : "--"}
          />
          <MiniStat label="Timeframe" value={serializedCall.timeframe ?? "--"} />
          <MiniStat
            label="Confidence"
            value={`${(serializedCall.extraction_confidence * 100).toFixed(0)}%`}
          />
          <MiniStat label={scoreLabel} value={scoreValue} />
        </div>
      </section>

      {/* Price performance */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <PriceCard
          label="7 Days"
          status={serializedCall.horizon_status_7d}
          priceAfter={serializedCall.price_7d}
          returnPct={serializedCall.return_7d}
          alphaPct={serializedCall.alpha_7d}
          btcReturn={serializedCall.btc_price_at_call && serializedCall.btc_price_7d
            ? ((serializedCall.btc_price_7d - serializedCall.btc_price_at_call) / serializedCall.btc_price_at_call) * 100
            : null}
        />
        <PriceCard
          label="30 Days"
          status={serializedCall.horizon_status_30d}
          priceAfter={serializedCall.price_30d}
          returnPct={serializedCall.return_30d}
          alphaPct={serializedCall.alpha_30d}
          btcReturn={serializedCall.btc_price_at_call && serializedCall.btc_price_30d
            ? ((serializedCall.btc_price_30d - serializedCall.btc_price_at_call) / serializedCall.btc_price_at_call) * 100
            : null}
        />
        <PriceCard
          label="90 Days"
          status={serializedCall.horizon_status_90d}
          priceAfter={serializedCall.price_90d}
          returnPct={serializedCall.return_90d}
          alphaPct={serializedCall.alpha_90d}
          btcReturn={serializedCall.btc_price_at_call && serializedCall.btc_price_90d
            ? ((serializedCall.btc_price_90d - serializedCall.btc_price_at_call) / serializedCall.btc_price_at_call) * 100
            : null}
        />
      </section>

      {/* Score breakdown + Market regime */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {serializedCall.public_score_components ? (
          <ScoreBreakdown
            direction={serializedCall.public_score_components.direction}
            alpha={serializedCall.public_score_components.alpha}
            specificity={serializedCall.public_score_components.specificity}
            regime={serializedCall.public_score_components.regime}
            target={serializedCall.public_score_components.target}
          />
        ) : (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm">Alpha Score</h2>
              <span className="text-gray-400 font-bold text-lg tabular-nums">
                {scoreValue}
              </span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              {serializedCall.score_status === "excluded_confidence"
                ? "This call is displayed publicly, but it is not counted because the extraction did not clear the public 70% confidence threshold."
                : serializedCall.score_status === "invalid_extraction"
                  ? "This extraction failed the public sanity checks for asset, direction, or target labeling, so it is not scored."
                  : "This call is still pending because the full scoring window has not elapsed yet."}
            </p>
          </div>
        )}

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
                    style={{ width: `${serializedCall.regime_difficulty * 100}%` }}
                  />
                </div>
                <span className="text-gray-300 text-xs tabular-nums">
                  {(serializedCall.regime_difficulty * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                Direction Correct
              </p>
              <span
                className={`text-sm font-semibold ${
                  serializedCall.correct_direction ? "text-brand-green" : "text-brand-red"
                }`}
              >
                {serializedCall.horizon_status_30d === "pending"
                  ? "Pending"
                  : serializedCall.correct_direction ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">
                Hit Target
              </p>
              <span
                className={`text-sm font-semibold ${
                  serializedCall.hit_target ? "text-brand-green" : "text-brand-red"
                }`}
              >
                {serializedCall.target_price === null
                  ? "No target"
                  : serializedCall.target_status === "pending"
                  ? "Pending"
                  : serializedCall.hit_target ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Raw quote */}
      {serializedCall.raw_quote && (
        <section className="mb-8">
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Quote className="w-5 h-5 text-brand-gold" />
              <h2 className="text-white font-semibold text-sm">
                From the Transcript
              </h2>
            </div>
            <blockquote className="border-l-2 border-brand-gold/40 pl-4 text-gray-300 text-sm leading-relaxed italic">
              &ldquo;{serializedCall.raw_quote}&rdquo;
            </blockquote>
            <p className="text-gray-600 text-xs mt-3">
              Extraction confidence: {(serializedCall.extraction_confidence * 100).toFixed(0)}%
            </p>
            {serializedCall.extraction_notes.length > 0 && (
              <p className="text-gray-600 text-xs mt-2">
                Validation: {serializedCall.extraction_notes.join("; ")}
              </p>
            )}
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
  readonly status: "pending" | "available";
  readonly priceAfter: number | null;
  readonly returnPct: number | null;
  readonly alphaPct: number | null;
  readonly btcReturn: number | null;
}

function PriceCard({
  label,
  status,
  priceAfter,
  returnPct,
  alphaPct,
  btcReturn,
}: PriceCardProps) {
  const hasData = status === "available" && priceAfter !== null && returnPct !== null;

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
        <p className="text-gray-600 text-sm">
          {status === "pending" ? "Pending until the horizon elapses" : "Not yet available"}
        </p>
      )}
    </div>
  );
}
