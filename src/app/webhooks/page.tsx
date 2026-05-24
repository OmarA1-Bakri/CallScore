import Link from "next/link";
import { Chip, EditorialSection, MetaStrip } from "@/components/primitives";

const TITLE = "Webhooks — CallScore";
const DESCRIPTION =
  "Alpha API delivery for signed CallScore webhook events, retries, and external trading or research systems.";
const LINK_CLASS =
  "text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/webhooks" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const EVENT_TYPES = [
  { name: "new_call_digest", detail: "Queued creator watchlist activity." },
  { name: "consensus_signal", detail: "Consensus and convergence events." },
];

const RETRY_RULES = [
  "HTTPS endpoints only",
  "HMAC signature header",
  "Delivery log per attempt",
  "Retry on transient failure",
];

export default function WebhooksPage() {
  return (
    <div className="mx-auto max-w-page px-4 tab:px-6 desk:px-8">
      <section className="border-b border-ink-250 pb-12">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-caps text-ink-500">
          Webhooks · Alpha delivery
        </p>
        <h1 className="mb-5 max-w-[930px] text-balance font-serif text-[35px] font-medium leading-[1.05] tracking-tight text-ink-900 tab:text-[45px] desk:text-[53px]">
          Send signed CallScore events to your systems.{" "}
          <em className="italic font-normal text-accent">External workflows, verified.</em>
        </h1>
        <p className="max-w-[760px] font-serif text-[20px] leading-relaxed text-ink-700">
          Webhooks are the Alpha/API delivery surface for teams that want CallScore events in
          research tools, bots, and internal monitors.
        </p>
        <MetaStrip
          cells={[
            { k: "plan gate", v: "Alpha" },
            { k: "payloads", v: "signed" },
            { k: "logs", v: "delivery" },
            { k: "retry", v: "policy" },
          ]}
        />
      </section>

      <EditorialSection
        index="01"
        title={
          <>
            Event <em className="italic text-accent">types</em>.
          </>
        }
        meta={<>calls · creators · consensus</>}
      >
        <div className="grid gap-4 tab:grid-cols-2">
          {EVENT_TYPES.map((event) => (
            <article key={event.name} className="border-t border-ink-250 pt-3">
              <h3 className="mb-2 font-mono text-[12px] uppercase tracking-caps text-accent">
                {event.name}
              </h3>
              <p className="font-serif text-[16px] leading-relaxed text-ink-700">
                {event.detail}
              </p>
            </article>
          ))}
        </div>
      </EditorialSection>

      <EditorialSection
        index="02"
        title={
          <>
            Signing and <em className="italic text-accent">security</em>.
          </>
        }
        meta={<>verify before ingest</>}
      >
        <p className="max-w-[720px] font-serif text-[17px] leading-relaxed text-ink-700">
          Each delivery is signed so receivers can verify that the payload came from CallScore
          before it reaches downstream automations.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Chip tone="accent">HMAC signed</Chip>
          <Chip tone="new">HTTPS target</Chip>
          <Chip tone="neutral">secret rotation</Chip>
          <Chip tone="warn">test delivery</Chip>
        </div>
      </EditorialSection>

      <EditorialSection
        index="03"
        title={
          <>
            Retry and delivery <em className="italic text-accent">logs</em>.
          </>
        }
        meta={<>attempt history · operational trace</>}
      >
        <ul className="grid gap-3 tab:grid-cols-2">
          {RETRY_RULES.map((rule) => (
            <li key={rule} className="border-t border-ink-250 pt-3">
              <span className="mr-2 inline-block h-2 w-2 bg-new" aria-hidden="true" />
              <span className="font-serif text-[16px] text-ink-800">{rule}</span>
            </li>
          ))}
        </ul>
      </EditorialSection>

      <EditorialSection
        index="04"
        title={
          <>
            Configure <em className="italic text-accent">webhooks</em>.
          </>
        }
        meta={<>settings stay authenticated</>}
      >
        <div className="flex flex-col gap-3 font-mono text-[12px] uppercase tracking-caps tab:flex-row">
          <Link href="/settings/webhooks" className={LINK_CLASS}>
            Open webhook settings <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link href="/pricing" className={LINK_CLASS}>
            Compare Alpha access <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </EditorialSection>
    </div>
  );
}
