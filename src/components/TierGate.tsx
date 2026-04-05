import Link from "next/link";
import { Lock, Crown } from "lucide-react";
import type { Tier } from "@/lib/types";

interface TierGateProps {
  readonly tier: "pro" | "elite";
  readonly children: React.ReactNode;
}

const TIER_CONFIG = {
  pro: {
    label: "Pro",
    price: "$50/mo",
    description: "Unlock the consistent outperformers",
    gradient: "from-brand-accent to-purple-400",
    borderColor: "border-brand-accent/30",
    bgColor: "bg-brand-accent/10",
    buttonBg: "bg-brand-accent hover:bg-brand-accent/80",
    icon: Lock,
    glowClass: "glow-purple",
  },
  elite: {
    label: "Elite",
    price: "$99/mo",
    description: "Full access + consensus signals",
    gradient: "from-brand-gold to-yellow-400",
    borderColor: "border-brand-gold/30",
    bgColor: "bg-brand-gold/10",
    buttonBg: "bg-brand-gold hover:bg-brand-gold-dim",
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
      <div className="absolute inset-0 flex items-center justify-center bg-brand-dark/60 backdrop-blur-sm">
        <div
          className={`text-center p-6 rounded-xl border ${config.borderColor} ${config.bgColor} ${config.glowClass}`}
        >
          <Icon className="w-8 h-8 mx-auto mb-3 text-gray-400" />
          <p className={`text-sm font-bold bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent mb-1`}>
            Upgrade to {config.label}
          </p>
          <p className="text-gray-500 text-xs mb-1">{config.description}</p>
          <p className="text-white font-bold text-lg mb-3">{config.price}</p>
          <Link
            href="/pricing"
            className={`inline-block ${config.buttonBg} text-brand-dark font-semibold text-sm px-6 py-2 rounded-lg transition-colors`}
          >
            Unlock
          </Link>
        </div>
      </div>
    </div>
  );
}
