interface AlphaScoreBadgeProps {
  readonly score: number;
  readonly size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-pos";
  if (score >= 50) return "text-yellow-400";
  if (score >= 30) return "text-orange-400";
  return "text-neg";
}

function getBarColor(score: number): string {
  if (score >= 70) return "bg-pos";
  if (score >= 50) return "bg-yellow-400";
  if (score >= 30) return "bg-orange-400";
  return "bg-neg";
}

function getGlowColor(score: number): string {
  if (score >= 70) return "shadow-pos/20";
  if (score >= 50) return "shadow-yellow-400/20";
  if (score >= 30) return "shadow-orange-400/20";
  return "shadow-neg/20";
}

const SIZE_MAP = {
  sm: { container: "w-14 h-14", text: "text-sm", label: "text-[8px]" },
  md: { container: "w-18 h-18", text: "text-lg", label: "text-[9px]" },
  lg: { container: "w-24 h-24", text: "text-2xl", label: "text-xs" },
} as const;

export default function AlphaScoreBadge({
  score,
  size = "md",
}: AlphaScoreBadgeProps) {
  const roundedScore = Math.round(score);
  const sizeStyles = SIZE_MAP[size];
  const percentage = Math.min(100, Math.max(0, roundedScore));

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative ${sizeStyles.container} flex items-center justify-center`}
      >
        {/* Background ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="#1e1e2e"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${percentage * 2.64} ${264 - percentage * 2.64}`}
            className={`${getScoreColor(roundedScore)} transition-all duration-700`}
          />
        </svg>

        {/* Score number */}
        <span
          className={`${sizeStyles.text} font-bold tabular-nums ${getScoreColor(roundedScore)}`}
        >
          {roundedScore}
        </span>
      </div>
      <span className={`${sizeStyles.label} text-gray-500 uppercase tracking-wider font-medium`}>
        Alpha Score
      </span>
    </div>
  );
}

/** Inline horizontal bar variant used in table rows */
export function AlphaScoreBar({ score }: { readonly score: number }) {
  const roundedScore = Math.round(score);
  const percentage = Math.min(100, Math.max(0, roundedScore));

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <span className={`text-sm font-bold tabular-nums w-8 ${getScoreColor(roundedScore)}`}>
        {roundedScore}
      </span>
      <div className="flex-1 h-1.5 bg-ink-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getBarColor(roundedScore)} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
