import clsx from "clsx";

export type RankTier = "S" | "A" | "B" | "C" | "D";

export interface RankTierBadgeProps {
  readonly tier: RankTier;
}

export default function RankTierBadge({ tier }: RankTierBadgeProps) {
  return <span className={clsx("rank-tier", `rank-tier-${tier.toLowerCase()}`)}>Tier {tier}</span>;
}
