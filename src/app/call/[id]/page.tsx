import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout";
import { MetricCard } from "@/components/composites";
import {
  AlphaScore,
  Badge,
  ConfidenceBar,
  DirChip,
  Provenance,
  Token,
} from "@/components/primitives";
import { query } from "@/lib/db";
import { REGIME_LABELS, SYMBOL_NAMES, SYMBOL_TICKERS } from "@/lib/constants";
import { serializeCall } from "@/lib/public-serializer";
import type { SerializedCall } from "@/lib/public-serializer";
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

function displayDirection(direction: Call["direction"]): "long" | "short" | "neutral" {
  if (direction === "bullish") return "long";
  if (direction === "bearish") return "short";
  return "neutral";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatPrice(value: number | null): string {
  return value === null ? "—" : `$${value.toLocaleString()}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function statusTone(status: SerializedCall["score_status"]): "neutral" | "pos" | "warn" {
  if (status === "scored") return "pos";
  if (status === "pending_horizon") return "warn";
  return "neutral";
}

function directionResult(call: SerializedCall): string {
  if (call.horizon_status_30d === "pending") return "Pending";
  return call.correct_direction ? "Correct" : "Missed";
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
  const scoreValue = serializedCall.public_score ?? 0;
  const regimeLabel = serializedCall.regime_at_call !== null
    ? REGIME_LABELS[serializedCall.regime_at_call] ?? "Unknown"
    : "Unknown";

  return (
    <PageShell>
      <Link href={`/creator/${creatorHandle}`} className="call-backlink">← back to {creatorName}</Link>

      <section className="call-hero">
        <div className="call-asset-lockup">
          <Token symbol={serializedCall.symbol} />
          <DirChip direction={displayDirection(serializedCall.direction)} />
          <Badge tone={statusTone(serializedCall.score_status)}>
            {serializedCall.score_status.replaceAll("_", " ")}
          </Badge>
        </div>
        <div>
          <p className="shell-kicker">Call evidence · {formatDate(serializedCall.call_date)}</p>
          <h1>{ticker} {serializedCall.direction} call by <em>{creatorName}</em></h1>
          <p className="shell-lede">
            {coinName} call with {formatPrice(serializedCall.entry_price)} entry, {formatPrice(serializedCall.target_price)} target,
            and {formatPrice(serializedCall.stop_loss)} stop. Public scoring follows the same serializer used across leaderboard routes.
          </p>
        </div>
        <div className="call-score-card">
          <AlphaScore value={scoreValue} window="public" variant="hero" confidence={serializedCall.score_status === "scored" ? "normal" : "low"} />
          <span>{serializedCall.score_status === "scored" ? "Alpha Score" : "Awaiting final score"}</span>
        </div>
      </section>

      <section className="call-metrics" aria-label="Call summary">
        <MetricCard kicker="30d α" label="Excess vs BTC" value={formatPercent(serializedCall.alpha_30d)} detail={`Return ${formatPercent(serializedCall.return_30d)} over 30d.`} alpha={serializedCall.alpha_30d ?? 0} />
        <MetricCard kicker="Direction" label="Outcome" value={directionResult(serializedCall)} detail={`Horizon status: ${serializedCall.horizon_status_30d}.`} />
        <MetricCard kicker="Target" label="Hit status" value={serializedCall.target_status === "pending" ? "Pending" : serializedCall.hit_target ? "Hit" : "Missed"} detail={serializedCall.target_price ? `Target ${formatPrice(serializedCall.target_price)}.` : "No target declared."} />
        <MetricCard kicker="Regime" label="Market context" value={regimeLabel} detail={`Difficulty ${(serializedCall.regime_difficulty * 100).toFixed(0)}%.`} />
      </section>

      <section className="call-body">
        <div className="call-panel">
          <div className="call-section-head">
            <p className="shell-kicker">Horizon performance</p>
            <Provenance href="/methodology" label="score method" />
          </div>
          <div className="call-horizons">
            <HorizonCard label="7 days" status={serializedCall.horizon_status_7d} price={serializedCall.price_7d} returnPct={serializedCall.return_7d} alphaPct={serializedCall.alpha_7d} />
            <HorizonCard label="30 days" status={serializedCall.horizon_status_30d} price={serializedCall.price_30d} returnPct={serializedCall.return_30d} alphaPct={serializedCall.alpha_30d} />
            <HorizonCard label="90 days" status={serializedCall.horizon_status_90d} price={serializedCall.price_90d} returnPct={serializedCall.return_90d} alphaPct={serializedCall.alpha_90d} />
          </div>
        </div>

        <aside className="call-panel call-rail">
          <p className="shell-kicker">Extraction quality</p>
          <ConfidenceBar value={serializedCall.extraction_confidence} label="AI extraction confidence" />
          <dl>
            <div><dt>Timeframe</dt><dd>{serializedCall.timeframe ?? "—"}</dd></div>
            <div><dt>Strategy</dt><dd>{serializedCall.strategy_type ?? "—"}</dd></div>
            <div><dt>Specificity</dt><dd>{serializedCall.specificity_score.toFixed(1)}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="call-body call-body-secondary">
        <div className="call-panel">
          <p className="shell-kicker">Score components</p>
          {serializedCall.public_score_components ? (
            <dl className="call-component-grid">
              <div><dt>Direction</dt><dd>{serializedCall.public_score_components.direction.toFixed(1)}</dd></div>
              <div><dt>Alpha</dt><dd>{serializedCall.public_score_components.alpha.toFixed(1)}</dd></div>
              <div><dt>Specificity</dt><dd>{serializedCall.public_score_components.specificity.toFixed(1)}</dd></div>
              <div><dt>Regime</dt><dd>{serializedCall.public_score_components.regime.toFixed(1)}</dd></div>
              <div><dt>Target</dt><dd>{serializedCall.public_score_components.target.toFixed(1)}</dd></div>
            </dl>
          ) : (
            <p className="call-muted">This call is visible, but its scoring components are hidden until the call clears validation and horizon rules.</p>
          )}
        </div>

        {serializedCall.raw_quote ? (
          <blockquote className="call-quote">
            <span>Transcript excerpt</span>
            “{serializedCall.raw_quote}”
            {serializedCall.extraction_notes.length > 0 ? <small>Validation: {serializedCall.extraction_notes.join("; ")}</small> : null}
          </blockquote>
        ) : (
          <div className="call-quote call-quote-empty"><span>Transcript excerpt</span>No public quote captured for this call yet.</div>
        )}
      </section>
    </PageShell>
  );
}

interface HorizonCardProps {
  readonly label: string;
  readonly status: "pending" | "available";
  readonly price: number | null;
  readonly returnPct: number | null;
  readonly alphaPct: number | null;
}

function HorizonCard({ label, status, price, returnPct, alphaPct }: HorizonCardProps) {
  return (
    <article className="call-horizon-card">
      <span>{label}</span>
      {status === "available" ? (
        <>
          <strong>{formatPrice(price)}</strong>
          <p>Return {formatPercent(returnPct)}</p>
          <p className={alphaPct !== null && alphaPct >= 0 ? "calls-pos" : "calls-neg"}>Alpha {formatPercent(alphaPct)}</p>
        </>
      ) : (
        <p>Pending until this horizon elapses.</p>
      )}
    </article>
  );
}
