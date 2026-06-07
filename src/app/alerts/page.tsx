import Link from "next/link";
import { Chip, EditorialSection, MetaStrip } from "@/components/primitives";

const TITLE = "Alerts — CallScore";
const DESCRIPTION =
  "Paid creator and call monitoring for CallScore watchlists, delivery queues, and Pro alert workflows.";
const LINK_CLASS =
  "text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/alerts" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const MONITORING_SCOPE = [
  "New ranked creator calls",
  "Resolved outcome updates",
  "Watchlist creator movement",
  "Anti-consensus preview events",
];

const DELIVERY_FLOW = [
  { label: "Watch", detail: "Add creators from the public evidence trail." },
  { label: "Match", detail: "Calls pass through extraction, confidence, and price matching." },
  { label: "Queue", detail: "Eligible events enter the durable alert queue." },
  { label: "Deliver", detail: "Email delivery reports back into recent queue state." },
];

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-page px-4 tab:px-6 desk:px-8">
      <section className="border-b border-ink-250 pb-12">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-caps text-ink-500">
          Alerts · Paid delivery
        </p>
        <h1 className="mb-5 max-w-[900px] text-balance font-serif text-[35px] font-medium leading-[1.05] tracking-tight text-ink-900 tab:text-[45px] desk:text-[53px]">
          Monitor creators without refreshing.{" "}
          <em className="italic font-normal text-accent">Watchlists become delivery.</em>
        </h1>
        <p className="max-w-[760px] font-serif text-[20px] leading-relaxed text-ink-700">
          Alerts turn CallScore&apos;s public evidence trail into paid monitoring for creator
          calls, score movement, and resolved outcomes.
        </p>
        <MetaStrip
          cells={[
            { k: "plan gate", v: "Pro+" },
            { k: "delivery", v: "email" },
            { k: "source", v: "watchlists" },
            { k: "queue", v: "durable" },
          ]}
        />
      </section>

      <EditorialSection
        index="01"
        title={
          <>
            Monitoring <em className="italic text-accent">scope</em>.
          </>
        }
        meta={<>creator calls · score movement · resolved outcomes</>}
      >
        <p className="mb-5 max-w-[700px] font-serif text-[17px] leading-relaxed text-ink-700">
          Pro alerts watch the same raw evidence that powers public profiles. The product is
          delivery, not hidden research.
        </p>
        <div className="grid gap-3 tab:grid-cols-2">
          {MONITORING_SCOPE.map((item) => (
            <div key={item} className="border-t border-ink-250 pt-3">
              <span className="mr-2 inline-block h-2 w-2 bg-accent" aria-hidden="true" />
              <span className="font-serif text-[16px] text-ink-800">{item}</span>
            </div>
          ))}
        </div>
      </EditorialSection>

      <EditorialSection
        index="02"
        title={
          <>
            Watchlist to <em className="italic text-accent">delivery</em>.
          </>
        }
        meta={<>queued jobs · auditable state</>}
      >
        <ol className="grid gap-4 tab:grid-cols-4">
          {DELIVERY_FLOW.map((step, index) => (
            <li key={step.label} className="border-t border-ink-250 pt-3">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
                {String(index + 1).padStart(2, "0")} · {step.label}
              </p>
              <p className="font-serif text-[15px] leading-relaxed text-ink-700">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
      </EditorialSection>

      <EditorialSection
        index="03"
        title={
          <>
            What Pro <em className="italic text-accent">unlocks</em>.
          </>
        }
        meta={<>paid tier · no private leaderboard</>}
      >
        <div className="flex flex-wrap gap-2">
          <Chip tone="accent">creator watchlists</Chip>
          <Chip tone="new">delivery queue</Chip>
          <Chip tone="pos">resolved call alerts</Chip>
          <Chip tone="warn">anti-consensus preview</Chip>
        </div>
        <p className="mt-5 max-w-[700px] font-serif text-[17px] leading-relaxed text-ink-700">
          Configure the creators you care about, then let the queue report when CallScore has
          enough evidence to deliver.
        </p>
      </EditorialSection>

      <EditorialSection
        index="04"
        title={
          <>
            Configure <em className="italic text-accent">alerts</em>.
          </>
        }
        meta={<>settings stay authenticated</>}
      >
        <div className="flex flex-col gap-3 font-mono text-[12px] uppercase tracking-caps tab:flex-row">
          <Link href="/settings/alerts" className={LINK_CLASS}>
            Open alert settings <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link href="/pricing" className={LINK_CLASS}>
            Compare paid plans <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </EditorialSection>
    </div>
  );
}
