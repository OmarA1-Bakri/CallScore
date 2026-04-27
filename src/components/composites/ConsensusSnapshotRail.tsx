import { DirChip, Provenance, RankTierBadge, Token } from "@/components/primitives";

const SNAPSHOTS = [
  { asset: "SOL", direction: "long" as const, voices: 8, tier: "S" as const },
  { asset: "ETH", direction: "short" as const, voices: 5, tier: "A" as const },
];

export default function ConsensusSnapshotRail() {
  return (
    <aside className="snapshot-rail">
      <p className="shell-kicker">Consensus snapshot</p>
      {SNAPSHOTS.map((item) => (
        <article key={`${item.asset}-${item.direction}`}>
          <Token symbol={item.asset} />
          <DirChip direction={item.direction} />
          <RankTierBadge tier={item.tier} />
          <span>{item.voices} voices</span>
        </article>
      ))}
      <Provenance href="/signals/active" label="signals ledger" />
    </aside>
  );
}
