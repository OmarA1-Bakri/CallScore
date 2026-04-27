import { Lock } from "lucide-react";

export interface PremiumPreviewLockProps {
  readonly gate: string;
  readonly children: React.ReactNode;
}

export default function PremiumPreviewLock({ gate, children }: PremiumPreviewLockProps) {
  return (
    <div className="premium-lock" aria-label={`${gate} locked preview`}>
      <div className="premium-lock-content">{children}</div>
      <div className="premium-lock-veil">
        <Lock aria-hidden="true" size={14} strokeWidth={1.4} />
        <span>{gate}</span>
      </div>
    </div>
  );
}
