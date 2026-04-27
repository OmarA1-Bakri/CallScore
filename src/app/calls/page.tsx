import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { ControlsRow, MetricCard } from "@/components/composites";
import {
  AlphaScore,
  Badge,
  DirChip,
  Provenance,
  SignalFreshness,
  Token,
} from "@/components/primitives";
import { query } from "@/lib/db";
import { serializeCall } from "@/lib/public-serializer";
import type { SerializedCall } from "@/lib/public-serializer";
import type { Call } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calls Explorer | CryptoTubers Ranked",
  description: "Inspect the public evidence ledger behind scored crypto creator calls.",
  alternates: { canonical: "/calls" },
};

interface CallWithCreator extends Call {
  readonly creator_name: string | null;
  readonly creator_handle: string | null;
}

interface LedgerCall extends SerializedCall {
  readonly creator_name: string;
  readonly creator_handle: string;
}

function displayDirection(direction: Call["direction"]): "long" | "short" | "neutral" {
  if (direction === "bullish") return "long";
  if (direction === "bearish") return "short";
  return "neutral";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function freshnessFor(callDate: string): { state: "hot" | "fresh" | "stale" | "fading"; label: string } {
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(callDate).getTime()) / 86_400_000));
  if (ageDays <= 7) return { state: "hot", label: "hot" };
  if (ageDays <= 30) return { state: "fresh", label: "fresh" };
  if (ageDays <= 90) return { state: "fading", label: "maturing" };
  return { state: "stale", label: "settled" };
}

function serializeLedgerCall(call: CallWithCreator): LedgerCall {
  return {
    ...serializeCall(call),
    creator_name: call.creator_name ?? "Unknown creator",
    creator_handle: call.creator_handle ?? "unknown",
  };
}

export default async function CallsPage() {
  let calls: LedgerCall[] = [];

  try {
    const rows = await query<CallWithCreator>(
      `SELECT calls.*, creators.name AS creator_name, creators.youtube_handle AS creator_handle
       FROM calls
       LEFT JOIN creators ON creators.id = calls.creator_id
       ORDER BY calls.call_date DESC, calls.id DESC
       LIMIT 75`,
    );
    calls = rows.map(serializeLedgerCall);
  } catch {
    calls = [];
  }

  const scoredCalls = calls.filter((call) => call.score_status === "scored");
  const pendingCalls = calls.filter((call) => call.score_status === "pending_horizon");
  const avgAlpha = scoredCalls.length > 0
    ? scoredCalls.reduce((sum, call) => sum + (call.alpha_30d ?? 0), 0) / scoredCalls.length
    : 0;
  const winRate = scoredCalls.length > 0
    ? scoredCalls.filter((call) => call.correct_direction).length / scoredCalls.length
    : 0;

  return (
    <PageShell>
      <section className="calls-hero">
        <div>
          <p className="shell-kicker">Calls explorer</p>
          <h1>Inspect the evidence behind every scored call.</h1>
          <p className="shell-lede">
            A public, timestamped ledger of creator calls with horizon status, alpha versus BTC, and scoring provenance.
          </p>
        </div>
        <div className="calls-hero-card">
          <AlphaScore value={avgAlpha} window="30d avg" variant="hero" confidence={scoredCalls.length < 20 ? "low" : "normal"} />
          <span>{scoredCalls.length} scored calls in this sample</span>
        </div>
      </section>

      <section className="calls-metrics" aria-label="Calls summary">
        <MetricCard kicker="Ledger" label="Tracked calls" value={String(calls.length)} detail="Most recent 75 public calls." />
        <MetricCard kicker="Scored" label="Eligible sample" value={String(scoredCalls.length)} detail={`${pendingCalls.length} calls still maturing.`} />
        <MetricCard kicker="Win rate" label="Direction correct" value={`${(winRate * 100).toFixed(1)}%`} detail="Calculated on scored calls only." />
        <MetricCard kicker="Avg α" label="30d excess" value={`${avgAlpha >= 0 ? "+" : ""}${avgAlpha.toFixed(1)}%`} detail="Relative to BTC over the 30d horizon." alpha={avgAlpha} />
      </section>

      <ControlsRow />

      <section className="calls-ledger" aria-label="Public call ledger">
        <div className="calls-ledger-head">
          <span>Asset</span>
          <span>Creator</span>
          <span>Call</span>
          <span>30d α</span>
          <span>Status</span>
          <span>Evidence</span>
        </div>

        {calls.length > 0 ? (
          calls.map((call) => {
            const freshness = freshnessFor(call.call_date);
            return (
              <article key={call.id} className="calls-ledger-row">
                <div className="calls-token-cell">
                  <Token symbol={call.symbol} />
                  <SignalFreshness state={freshness.state} label={freshness.label} />
                </div>
                <Link href={`/creator/${call.creator_handle}`} className="calls-creator-link">
                  {call.creator_name}
                  <span>{call.creator_handle}</span>
                </Link>
                <div className="calls-call-cell">
                  <DirChip direction={displayDirection(call.direction)} />
                  <span>{formatDate(call.call_date)}</span>
                  {call.timeframe ? <Badge tone="neutral">{call.timeframe}</Badge> : null}
                </div>
                <strong className={call.alpha_30d !== null && call.alpha_30d >= 0 ? "calls-pos" : "calls-neg"}>
                  {formatPercent(call.alpha_30d)}
                </strong>
                <Badge tone={call.score_status === "scored" ? "pos" : call.score_status === "pending_horizon" ? "warn" : "neutral"}>
                  {call.score_status.replaceAll("_", " ")}
                </Badge>
                <Provenance href={`/call/${call.id}`} label="open call" />
              </article>
            );
          })
        ) : (
          <div className="leaderboard-empty">
            <span className="shell-square" aria-hidden="true" />
            <p>No public calls are available in the local database yet.</p>
          </div>
        )}
      </section>
    </PageShell>
  );
}
