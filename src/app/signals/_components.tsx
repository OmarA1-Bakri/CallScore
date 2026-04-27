import Link from "next/link";
import { Badge, DirChip, SignalFreshness, Token } from "@/components/primitives";
import type { SignalView } from "./_data";
import { formatPercent, signalFreshness } from "./_data";

function displayDirection(direction: SignalView["direction"]): "long" | "short" | "neutral" {
  return direction === "bullish" ? "long" : "short";
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

export function SignalCard({ signal }: { readonly signal: SignalView }) {
  const freshness = signalFreshness(signal.signal_date);
  const names = signal.creator_names.slice(0, 3).join(", ");

  return (
    <article className="signal-card">
      <div className="signal-card-top">
        <Token symbol={signal.symbol} />
        <DirChip direction={displayDirection(signal.direction)} />
        <SignalFreshness state={freshness.state} label={freshness.label} />
      </div>
      <h2>{signal.symbol.replace("USDT", "")} consensus thesis</h2>
      <p>{signal.creator_count} creators aligned since {formatDate(signal.signal_date)}{names ? ` · ${names}` : ""}</p>
      <div className="signal-card-stats">
        <div><span>Conviction</span><strong>{signal.conviction}</strong></div>
        <div><span>7d</span><strong>{formatPercent(signal.return_7d)}</strong></div>
        <div><span>30d</span><strong>{formatPercent(signal.return_30d)}</strong></div>
      </div>
      <div className="signal-card-actions">
        <Badge tone={signal.status === "active" ? "new" : signal.correct ? "pos" : "neg"}>{signal.status}</Badge>
        <Link href={`/signals/by-asset#${signal.symbol}`}>asset cluster</Link>
      </div>
    </article>
  );
}

export function SignalLedger({ signals }: { readonly signals: readonly SignalView[] }) {
  return (
    <div className="signal-ledger">
      <div className="signal-ledger-head"><span>Asset</span><span>Thesis</span><span>Creators</span><span>7d</span><span>30d</span><span>Status</span></div>
      {signals.map((signal) => {
        const freshness = signalFreshness(signal.signal_date);
        return (
          <article key={signal.id} className="signal-ledger-row" id={signal.symbol}>
            <div className="signal-asset"><Token symbol={signal.symbol} /><SignalFreshness state={freshness.state} label={freshness.label} /></div>
            <DirChip direction={displayDirection(signal.direction)} />
            <span>{signal.creator_count} creators</span>
            <strong className={signal.return_7d !== null && signal.return_7d >= 0 ? "calls-pos" : "calls-neg"}>{formatPercent(signal.return_7d)}</strong>
            <strong className={signal.return_30d !== null && signal.return_30d >= 0 ? "calls-pos" : "calls-neg"}>{formatPercent(signal.return_30d)}</strong>
            <Badge tone={signal.status === "active" ? "new" : signal.correct ? "pos" : "neg"}>{signal.status}</Badge>
          </article>
        );
      })}
    </div>
  );
}
