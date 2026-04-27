import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout";
import { Badge, PremiumPreviewLock } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Pricing | CryptoTubers Ranked",
  description: "Public beta pricing and roadmap for CryptoTubers Ranked.",
  alternates: { canonical: "/pricing" },
};

const TIERS = [
  { name: "Free", price: "$0", tag: "Public research", tone: "neutral", href: "/", features: ["Full public leaderboard", "Creator profiles", "Call ledger", "Score methodology"] },
  { name: "Pro", price: "$19", tag: "Workflow roadmap", tone: "accent", href: "/feedback", features: ["Saved screens", "Watchlist dashboard", "Export workflows", "Priority feedback"] },
  { name: "Alpha", price: "$49", tag: "Delivery roadmap", tone: "lock", href: "/feedback", features: ["Signal delivery", "API/webhooks", "Team routing", "Private experiments"] },
] as const;

const FAQ = [
  ["Why is the leaderboard free?", "The public research layer is intentionally open while premium delivery surfaces are rebuilt."],
  ["What will Pro unlock?", "Saved workflows, exports, and alert configuration once persistent account state lands."],
  ["What will Alpha unlock?", "Delivery-oriented products such as signal alerts, API access, and team routing."],
  ["Can I cancel anytime?", "Yes. The current public beta routes premium interest through feedback until billing is finalized."],
] as const;

export default function PricingPage() {
  return (
    <PageShell>
      <section className="pricing-hero">
        <div>
          <p className="shell-kicker">Pricing</p>
          <h1>Public research stays open. Premium is for delivery workflows.</h1>
          <p className="shell-lede">CryptoTubers Ranked is currently a public beta: the leaderboard, creator pages, calls, signals previews, and methodology remain available while paid workflow surfaces mature.</p>
        </div>
        <Badge tone="new">public beta</Badge>
      </section>

      <section className="pricing-grid" aria-label="Pricing tiers">
        {TIERS.map((tier) => (
          <article key={tier.name} className={tier.name === "Alpha" ? "pricing-card pricing-card-featured" : "pricing-card"}>
            <div className="pricing-card-head">
              <Badge tone={tier.tone}>{tier.tag}</Badge>
              <h2>{tier.name}</h2>
              <strong>{tier.price}<span>{tier.name === "Free" ? " forever" : " /mo"}</span></strong>
            </div>
            <ul>
              {tier.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
            </ul>
            {tier.name === "Free" ? (
              <Link href={tier.href} className="ui-button ui-button-primary">Start free</Link>
            ) : (
              <PremiumPreviewLock gate={`${tier.name} roadmap`}><Link href={tier.href} className="ui-button ui-button-outline">Join waitlist</Link></PremiumPreviewLock>
            )}
          </article>
        ))}
      </section>

      <section className="pricing-table" aria-label="Feature comparison">
        <div><span>Feature</span><span>Free</span><span>Pro</span><span>Alpha</span></div>
        <div><span>Leaderboard / profiles / calls</span><strong>Live</strong><strong>Live</strong><strong>Live</strong></div>
        <div><span>Saved dashboard state</span><strong>—</strong><strong>Planned</strong><strong>Planned</strong></div>
        <div><span>Signal delivery</span><strong>Preview</strong><strong>Planned</strong><strong>Planned</strong></div>
        <div><span>API and team workflows</span><strong>—</strong><strong>—</strong><strong>Planned</strong></div>
      </section>

      <section className="pricing-faq">
        {FAQ.map(([question, answer]) => <article key={question}><h2>{question}</h2><p>{answer}</p></article>)}
      </section>
    </PageShell>
  );
}
