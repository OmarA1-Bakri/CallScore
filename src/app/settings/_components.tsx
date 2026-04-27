import Link from "next/link";
import { Badge, PremiumPreviewLock } from "@/components/primitives";

export interface SettingPanelProps {
  readonly kicker: string;
  readonly title: string;
  readonly lede: string;
  readonly gate: string;
  readonly children: React.ReactNode;
}

export function SettingsHero({ kicker, title, lede, gate, children }: SettingPanelProps) {
  return (
    <>
      <section className="settings-hero">
        <div>
          <p className="shell-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="shell-lede">{lede}</p>
        </div>
        <Badge tone="lock">{gate}</Badge>
      </section>
      {children}
    </>
  );
}

export function SettingsCard({ title, copy, action, href = "/feedback" }: { readonly title: string; readonly copy: string; readonly action: string; readonly href?: string }) {
  return (
    <article className="settings-card">
      <h2>{title}</h2>
      <p>{copy}</p>
      <PremiumPreviewLock gate="roadmap gated"><Link href={href} className="ui-button ui-button-outline">{action}</Link></PremiumPreviewLock>
    </article>
  );
}
