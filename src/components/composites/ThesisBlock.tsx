import { Provenance, SignalFreshness } from "@/components/primitives";

export interface ThesisBlockProps {
  readonly title: string;
  readonly subtitle: string;
  readonly creators: number;
  readonly calls: number;
  readonly lastUpdated: string;
}

export default function ThesisBlock({ title, subtitle, creators, calls, lastUpdated }: ThesisBlockProps) {
  return (
    <section className="thesis-block">
      <div>
        <p className="shell-kicker">Leaderboard</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <aside className="thesis-stat-panel">
        <SignalFreshness state="fresh" label={lastUpdated} />
        <dl>
          <div><dt>creators</dt><dd>{creators}</dd></div>
          <div><dt>calls</dt><dd>{calls.toLocaleString()}</dd></div>
          <div><dt>sample</dt><dd>N ≥ 10</dd></div>
        </dl>
        <Provenance href="/methodology" label="methodology" />
      </aside>
    </section>
  );
}
