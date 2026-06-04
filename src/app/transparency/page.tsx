import Link from "next/link";
import type { Metadata } from "next";
import EditorialSection from "@/components/primitives/EditorialSection";
import Chip from "@/components/primitives/Chip";
import { query } from "@/lib/db";

export const metadata: Metadata = {
  title: "Transparency — CallScore",
  description:
    "CallScore believes in full transparency. These creators block public transcription of their videos, preventing independent verification of their market calls.",
  alternates: { canonical: "/transparency" },
};

export const dynamic = "force-dynamic";

interface BlockedCreator {
  name: string;
  handle: string;
  subscribers: number;
  blocked: number;
  available: number;
  pct_blocked: number;
}

async function getBlockedCreators(): Promise<BlockedCreator[]> {
  const rows = await query<BlockedCreator>(`
    SELECT 
      c.name, 
      c.youtube_handle as handle, 
      c.subscribers,
      COUNT(*) FILTER (WHERE v.transcript_status = 'failed')::int as blocked,
      COUNT(*) FILTER (WHERE v.transcript_status = 'available')::int as available,
      ROUND(
        COUNT(*) FILTER (WHERE v.transcript_status = 'failed')::numeric 
        / NULLIF(COUNT(*), 0) * 100, 0
      )::int as pct_blocked
    FROM videos v 
    JOIN creators c ON v.creator_id = c.id
    WHERE v.transcript_status IN ('failed', 'available')
    GROUP BY c.name, c.youtube_handle, c.subscribers
    HAVING COUNT(*) FILTER (WHERE v.transcript_status = 'failed') >= 1
    ORDER BY blocked DESC, pct_blocked DESC
    LIMIT 50
  `);
  return rows;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function TransparencyPage() {
  const creators = await getBlockedCreators();
  const totalBlocked = creators.reduce((s, c) => s + c.blocked, 0);
  const medianPct = creators.length > 0
    ? Math.round(creators.map(c => c.pct_blocked).sort((a, b) => a - b)[Math.floor(creators.length / 2)])
    : 0;

  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8">
      <EditorialSection
        index="01"
        title="No transcript. No score."
        meta={
          <span>
            CallScore verifies every market call against real price data. To do that, we need access to what was said.
          </span>
        }
      >
        <div className="flex flex-wrap gap-3 mb-6">
          <Chip tone="neg">{creators.length} blocked-transcript creators</Chip>
          <Chip tone="warn">{totalBlocked} blocked videos</Chip>
          <Chip tone="neutral">{medianPct}% median block rate</Chip>
        </div>

        <div className="overflow-x-auto border border-ink-250" style={{ borderRadius: 2 }}>
          <table className="w-full font-mono text-[13px]">
            <caption className="sr-only">Creators who block video transcription — ordered by most blocked videos first</caption>
            <thead className="border-b border-ink-250 bg-ink-50">
              <tr>
                <th scope="col" className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-3 px-4">Creator</th>
                <th scope="col" className="text-right text-[11px] text-ink-500 tracking-caps uppercase font-normal py-3 px-3">Subscribers</th>
                <th scope="col" className="text-right text-[11px] text-ink-500 tracking-caps uppercase font-normal py-3 px-3">Blocked</th>
                <th scope="col" className="text-right text-[11px] text-ink-500 tracking-caps uppercase font-normal py-3 px-3">Available</th>
                <th scope="col" className="text-right text-[11px] text-ink-500 tracking-caps uppercase font-normal py-3 px-4">% Blocked</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.handle} className="border-b border-ink-150 hover:bg-ink-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-serif text-[15px] text-ink-900">{c.name}</div>
                    <a
                      href={`https://www.youtube.com/${c.handle.startsWith("@") ? c.handle : "@" + c.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[12px] text-ink-500 hover:text-accent transition-colors"
                    >
                      {c.handle.startsWith("@") ? c.handle : "@" + c.handle}
                    </a>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-ink-700">{fmt(c.subscribers)}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-neg font-medium">{c.blocked}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-ink-500">{c.available}</td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    <span className={c.pct_blocked >= 50 ? "text-neg font-medium" : c.pct_blocked >= 30 ? "text-warn" : "text-ink-600"}>
                      {c.pct_blocked}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EditorialSection>

      <EditorialSection index="02" title="Our position" first={false}>
        <div className="font-serif text-[17px] text-ink-700 leading-relaxed max-w-[760px] space-y-4">
          <p>
            We at CallScore believe in full transparency compliance for all
            creators who provide market analysis or calls. This enables easy
            compliant access to the evidence required in order to audit and
            affirm the quality of the calls that were made.
          </p>
          <p>
            If you are a creator making calls in the public eye, do the right
            thing for your viewers — allow your transcripts to be audited by
            switching them on.
          </p>
        </div>
      </EditorialSection>

      <div className="border-t border-ink-250 py-8 mt-8">
        <Link
          href="/methodology"
          className="inline-flex items-center gap-2 font-mono text-[13px] tracking-caps uppercase text-accent hover:underline underline-offset-4"
        >
          <span aria-hidden="true">←</span> How we score
        </Link>
      </div>
    </div>
  );
}
