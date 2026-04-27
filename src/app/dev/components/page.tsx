import { PageShell } from "@/components/layout";
import {
  AlphaScore,
  Badge,
  Button,
  ConfidenceBar,
  DensityToggle,
  DirChip,
  FilterChip,
  LowNBadge,
  Originator,
  PremiumPreviewLock,
  Provenance,
  Rank,
  RankTierBadge,
  Search,
  SignalFreshness,
  TimeframeSelector,
  Token,
} from "@/components/primitives";

export default function ComponentsDevPage() {
  return (
    <PageShell className="shell-placeholder">
      <p className="shell-kicker">Component library</p>
      <h1>Primitive states for the editorial terminal system.</h1>
      <p className="shell-lede">
        Scratch route for Phase 2 primitive compile and visual smoke checks.
      </p>

      <div className="dev-grid">
        <section>
          <h2>Alpha</h2>
          <AlphaScore value={4.8} window="90d" variant="hero" peerMedian={1.6} />
          <AlphaScore value={-2.7} window="30d" peerMedian={0.4} confidence="low" />
          <AlphaScore value={0.8} window="all" stale />
        </section>

        <section>
          <h2>Evidence</h2>
          <Provenance href="/methodology" label="ledger" />
          <Provenance href="/pricing" locked />
          <SignalFreshness state="hot" label="2m ago" />
          <SignalFreshness state="fading" label="fading" />
        </section>

        <section>
          <h2>Chips</h2>
          <Rank value={1} />
          <RankTierBadge tier="S" />
          <DirChip direction="long" />
          <DirChip direction="short" />
          <Originator />
          <LowNBadge n={12} />
          <Badge tone="warn">disputed</Badge>
          <Token symbol="SOL" name="Solana" />
        </section>

        <section>
          <h2>Controls</h2>
          <Search placeholder="Search creators" aria-label="Search creators" />
          <div className="dev-row"><FilterChip active>Tier S</FilterChip><FilterChip>Low-N</FilterChip></div>
          <TimeframeSelector value="90d" />
          <DensityToggle value="comfortable" />
          <div className="dev-row"><Button variant="primary">Upgrade</Button><Button>Details</Button></div>
        </section>

        <section>
          <h2>Confidence</h2>
          <ConfidenceBar value={74} />
          <ConfidenceBar value={38} low label="sample" />
          <PremiumPreviewLock gate="Pro unlock">
            <div className="dev-locked-card">live thesis velocity · originator spread · β-α</div>
          </PremiumPreviewLock>
        </section>
      </div>
    </PageShell>
  );
}
