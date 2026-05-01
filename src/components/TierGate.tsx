import Link from "next/link";
import { Lock, Crown } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface TierGateProps {
  readonly tier: "pro" | "alpha";
  readonly children: ReactNode;
}

const TIERS = {
  pro: {
    label: "Pro",
    price: "$19/mo",
    description: "Deep analytics on every creator",
    Icon: Lock,
  },
  alpha: {
    label: "Alpha",
    price: "$49/mo",
    description: "Actionable signals, not just rankings",
    Icon: Crown,
  },
} as const;

export default function TierGate({
  tier,
  children,
}: TierGateProps): ReactElement {
  const t = TIERS[tier];
  const Icon = t.Icon;

  return (
    <div className="relative">
      <div
        className="blur-[6px] select-none pointer-events-none"
        aria-hidden="true"
        // @ts-expect-error -- `inert` is valid HTML5 but not yet in React 18 types
        inert=""
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-ink-0/60 backdrop-blur-sm">
        <div
          className="text-center px-6 py-5 border border-accent-dim bg-accent-low max-w-[320px]"
          style={{ borderRadius: 2 }}
        >
          <Icon className="w-5 h-5 mx-auto mb-2 text-accent" aria-hidden="true" />
          <p className="font-serif text-[19px] text-ink-900 font-medium leading-tight mb-1">
            Upgrade to <em className="italic text-accent">{t.label}</em>
          </p>
          <p className="font-mono text-[12px] text-ink-500 tracking-wide mb-3">
            {t.description}
          </p>
          <p className="font-serif text-[21px] text-ink-900 mb-4 tabular-nums">
            {t.price}
          </p>
          <Link
            href="/pricing"
            className="inline-block bg-accent hover:bg-accent-dim text-ink-0 font-mono text-[12px] tracking-caps uppercase px-4 py-2 transition-colors"
            style={{ borderRadius: 2 }}
          >
            Unlock
          </Link>
        </div>
      </div>
    </div>
  );
}
