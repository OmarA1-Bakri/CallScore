export interface OriginatorProps {
  readonly label?: string;
}

export default function Originator({ label = "originator" }: OriginatorProps) {
  return <span className="originator">◆ {label}</span>;
}
