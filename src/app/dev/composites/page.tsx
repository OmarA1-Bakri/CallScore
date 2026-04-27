import { PageShell } from "@/components/layout";
import { ConsensusSnapshotRail, ControlsRow, MetricCard, ThesisBlock } from "@/components/composites";

export default function CompositeDevPage() {
  return (
    <PageShell className="shell-placeholder">
      <ThesisBlock
        title="Who's actually worth listening to."
        subtitle="Calls scored against the chain · N≥10 · ranked by α (log-return excess vs benchmark)."
        creators={147}
        calls={12842}
        lastUpdated="2m ago"
      />
      <ControlsRow />
      <div className="composite-demo-grid">
        <MetricCard kicker="Alpha" label="Median excess" value="+4.8α" detail="Peer-adjusted over the selected window." alpha={4.8} />
        <MetricCard kicker="Evidence" label="Confidence" value="74%" detail="Confidence blends sample size, specificity, and provenance coverage." />
        <ConsensusSnapshotRail />
      </div>
    </PageShell>
  );
}
