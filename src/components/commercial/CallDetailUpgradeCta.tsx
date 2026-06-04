import Link from "next/link";
import type { ReactElement } from "react";

type CallDetailUpgradeCtaOfferTier = "Pro Monthly";

interface CallDetailUpgradeCtaProps {
  readonly offerTier: CallDetailUpgradeCtaOfferTier;
  readonly headline: string;
  readonly subheadline: string;
  readonly buttonCopy: string;
  readonly href?: string;
  readonly killSwitchActive?: boolean;
}

export default function CallDetailUpgradeCta({
  offerTier,
  headline,
  subheadline,
  buttonCopy,
  href = "/pricing",
  killSwitchActive = true,
}: CallDetailUpgradeCtaProps): ReactElement | null {
  if (!killSwitchActive) return null;

  return (
    <aside
      className="border border-accent-dim bg-accent-low/35 px-5 py-5"
      style={{ borderRadius: 2 }}
      data-cta-context="call_detail"
      data-offer-tier={offerTier}
    >
      <div className="font-mono text-[10px] text-accent tracking-caps uppercase mb-2">
        Operator-reviewed upgrade path · {offerTier}
      </div>
      <h2 className="font-serif text-[25px] tab:text-[31px] text-ink-900 font-medium tracking-tight leading-[1.1] mb-2">
        {headline}
      </h2>
      <p className="font-serif text-[16px] text-ink-700 leading-relaxed max-w-[620px] mb-4">
        {subheadline}
      </p>
      <Link
        href={href}
        className="inline-block font-mono text-[12px] tracking-caps uppercase border border-accent-dim text-accent hover:bg-accent-low px-4 py-2.5 transition-colors"
        style={{ borderRadius: 2 }}
        prefetch={false}
      >
        {buttonCopy} <span aria-hidden="true">→</span>
      </Link>
      <p className="font-mono text-[10px] text-ink-500 tracking-wide mt-3 max-w-[620px]">
        No checkout is started here. Review plan details before upgrading.
      </p>
    </aside>
  );
}
