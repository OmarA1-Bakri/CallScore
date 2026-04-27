import { AlphaScore, Badge, ConfidenceBar } from "@/components/primitives";

export interface MetricCardProps {
  readonly kicker: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly alpha?: number;
}

export default function MetricCard({ kicker, label, value, detail, alpha }: MetricCardProps) {
  return (
    <article className="metric-card">
      <p className="metric-kicker">{kicker}</p>
      <div className="metric-main">
        <h3>{label}</h3>
        <strong>{value}</strong>
      </div>
      <p>{detail}</p>
      {alpha !== undefined ? <AlphaScore value={alpha} window="90d" /> : <ConfidenceBar value={74} />}
      <Badge tone="accent">verified</Badge>
    </article>
  );
}
