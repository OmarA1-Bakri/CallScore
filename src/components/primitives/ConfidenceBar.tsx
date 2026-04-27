import clsx from "clsx";

export interface ConfidenceBarProps {
  readonly value: number;
  readonly label?: string;
  readonly low?: boolean;
}

export default function ConfidenceBar({ value, label = "confidence", low = false }: ConfidenceBarProps) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("confidence", low && "confidence-low")} aria-label={`${label}: ${percent}%`}>
      <span className="confidence-label">{label}</span>
      <span className="confidence-track" aria-hidden="true">
        <span className="confidence-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="confidence-value">{percent}%</span>
    </div>
  );
}
