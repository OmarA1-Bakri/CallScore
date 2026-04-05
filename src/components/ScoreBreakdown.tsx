interface ScoreBreakdownProps {
  readonly direction: number;
  readonly alpha: number;
  readonly specificity: number;
  readonly regime: number;
  readonly target: number;
}

const COMPONENTS = [
  { key: "direction", label: "Direction Correct", max: 40, color: "bg-brand-green" },
  { key: "alpha", label: "Alpha Over BTC", max: 25, color: "bg-blue-400" },
  { key: "specificity", label: "Specificity", max: 15, color: "bg-brand-accent" },
  { key: "regime", label: "Regime Difficulty", max: 10, color: "bg-orange-400" },
  { key: "target", label: "Target Hit", max: 10, color: "bg-brand-gold" },
] as const;

export default function ScoreBreakdown({
  direction,
  alpha,
  specificity,
  regime,
  target,
}: ScoreBreakdownProps) {
  const values: Record<string, number> = {
    direction,
    alpha,
    specificity,
    regime,
    target,
  };

  const total = direction + alpha + specificity + regime + target;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm">Score Breakdown</h3>
        <span className="text-brand-green font-bold text-lg tabular-nums">
          {total.toFixed(1)}
        </span>
      </div>

      <div className="space-y-3">
        {COMPONENTS.map((comp) => {
          const value = values[comp.key] ?? 0;
          const percentage = comp.max > 0 ? (value / comp.max) * 100 : 0;

          return (
            <div key={comp.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400 text-xs">{comp.label}</span>
                <span className="text-gray-300 text-xs tabular-nums">
                  {value.toFixed(1)} / {comp.max}
                </span>
              </div>
              <div className="h-2 bg-brand-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${comp.color} transition-all duration-500`}
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
