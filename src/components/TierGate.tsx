import Link from "next/link";
import { Lock, Crown } from "lucide-react";

interface TierGateProps {
  readonly tier: "pro" | "elite";
  readonly children: React.ReactNode;
}

const TIER_CONFIG = {
  pro: {
    label: "Pro",
    price: "$19/mo",
    description: "Deep analytics on every creator",
    gradient: "from-accent to-purple-400",
    borderColor: "border-accent/30",
    bgColor: "bg-accent/10",
    buttonBg: "bg-accent hover:bg-accent/80",
    icon: Lock,
    glowClass: "glow-purple",
  },
  elite: {
    label: "Alpha",
    price: "$49/mo",
    description: "Actionable signals, not just rankings",
    gradient: "from-accent to-yellow-400",
    borderColor: "border-accent/30",
    bgColor: "bg-accent/10",
    buttonBg: "bg-accent hover:bg-accent-dim",
    icon: Crown,
    glowClass: "glow-gold",
  },
} as const;

export default function TierGate({ tier, children }: TierGateProps) {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="blur-[6px] select-none pointer-events-none" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-ink-0/60 backdrop-blur-sm">
        <div
          className={`text-center p-6 rounded-xl border ${config.borderColor} ${config.bgColor} ${config.glowClass}`}
        >
          <Icon className="w-8 h-8 mx-auto mb-3 text-ink-600" />
          <p className={`text-sm font-bold bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent mb-1`}>
            Upgrade to {config.label}
          </p>
          <p className="text-ink-500 text-xs mb-1">{config.description}</p>
          <p className="text-ink-900 font-bold text-lg mb-3">{config.price}</p>
          <Link
            href="/pricing"
            className={`inline-block ${config.buttonBg} text-ink-0 font-semibold text-sm px-6 py-2 rounded-lg transition-colors`}
          >
            Unlock
          </Link>
        </div>
      </div>
    </div>
  );
}
