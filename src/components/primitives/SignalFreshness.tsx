import clsx from "clsx";

export type FreshnessState = "hot" | "fresh" | "stale" | "fading";

export interface SignalFreshnessProps {
  readonly state: FreshnessState;
  readonly label: string;
}

export default function SignalFreshness({ state, label }: SignalFreshnessProps) {
  return (
    <span className={clsx("freshness", `freshness-${state}`)}>
      <span className="freshness-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
