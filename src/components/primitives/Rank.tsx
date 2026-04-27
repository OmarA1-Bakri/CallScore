import clsx from "clsx";

export interface RankProps {
  readonly value: number;
  readonly size?: "sm" | "md";
}

export default function Rank({ value, size = "md" }: RankProps) {
  return <span className={clsx("rank", `rank-${size}`)}>#{value}</span>;
}
