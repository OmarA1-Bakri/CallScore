export interface LowNBadgeProps {
  readonly n: number;
  readonly threshold?: number;
}

export default function LowNBadge({ n, threshold = 20 }: LowNBadgeProps) {
  return (
    <span className="low-n-badge" title={`Low sample size: N=${n}, threshold ${threshold}`}>
      low-N · {n}/{threshold}
    </span>
  );
}
