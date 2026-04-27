import clsx from "clsx";

export type BadgeTone = "neutral" | "accent" | "pos" | "neg" | "warn" | "new" | "lock" | "lown";

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: React.ReactNode;
}

export default function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={clsx("badge", `badge-${tone}`)}>{children}</span>;
}
