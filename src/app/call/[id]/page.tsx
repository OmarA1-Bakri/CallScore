import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { EditorialSection, MetaStrip } from "@/components/primitives";
import { query } from "@/lib/db";
import { getLiveCallPriceJoinSql, getLiveCallPriceSelectSql } from "@/lib/live-call-pricing";
import { SYMBOL_TICKERS } from "@/lib/constants";
import { serializeCall } from "@/lib/public-serializer";
import type { Call, Creator } from "@/lib/types";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

// Map raw direction enum to trader vocabulary for display. Italic editorial accent
// reads naturally as "SOL Long" / "SOL Short" — never italicize lowercase enums
// like "bullish" / "neutral" directly (round2-003).
const DIRECTION_LABEL: Record<Call["direction"], string> = {
  bullish: "Long",
  bearish: "Short",
  neutral: "Sideways",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (isNaN(callId)) {
    return { title: "Call Not Found | CryptoTubers Ranked" };
  }

  try {
    const calls = await query<Call>(
      `SELECT c.*, ${getLiveCallPriceSelectSql()}
       FROM calls c
       ${getLiveCallPriceJoinSql("c")}
       WHERE c.id = $1 LIMIT 1`,
      [callId],
    );

    if (calls.length === 0) {
      return { title: "Call Not Found | CryptoTubers Ranked" };
    }

    const call = serializeCall(calls[0]);
    const ticker = SYMBOL_TICKERS[call.symbol] ?? call.symbol.replace("USDT", "");
    const direction = call.direction.charAt(0).toUpperCase() + call.direction.slice(1);
    const scoreText =
      call.public_score !== null ? `${call.public_score.toFixed(1)}/100` : call.score_status;

    return {
      title: `${ticker} ${direction} Call — CryptoTubers Ranked`,
      description: `Detailed breakdown of this ${ticker} ${call.direction} call: ${scoreText}, direction ${call.correct_direction ? "correct" : "wrong"}, with full alpha and regime analysis.`,
      alternates: { canonical: `/call/${id}` },
    };
  } catch {
    return { title: "Call Not Found | CryptoTubers Ranked" };
  }
}

export default async function CallDetailPage({ params }: PageProps) {
  const { id } = await params;
  const callId = parseInt(id, 10);
  if (isNaN(callId)) {
    notFound();
  }

  let call: Call;
  try {
    const calls = await query<Call>(
      `SELECT c.*, ${getLiveCallPriceSelectSql()}
       FROM calls c
       ${getLiveCallPriceJoinSql("c")}
       WHERE c.id = $1 LIMIT 1`,
      [callId],
    );
    if (calls.length === 0) {
      notFound();
    }
    call = calls[0];
  } catch {
    notFound();
  }

  let creator: Creator | null = null;
  try {
    const creators = await query<Creator>(
      `SELECT * FROM creators WHERE id = $1 LIMIT 1`,
      [call.creator_id],
    );
    creator = creators.length > 0 ? creators[0] : null;
  } catch {
    // Creator table may not exist yet
  }

  // Resolve YouTube video id (text) and timestamp from the videos table.
  // The Call.video_id is an FK to the internal videos.id, not the YouTube id;
  // we need the youtube_video_id to embed the iframe.
  let youtubeVideoId: string | null = null;
  let timestampSeconds: number | null = null;
  try {
    const videos = await query<{
      readonly youtube_video_id: string | null;
    }>(
      `SELECT youtube_video_id FROM videos WHERE id = $1 LIMIT 1`,
      [call.video_id],
    );
    if (videos.length > 0) {
      youtubeVideoId = videos[0].youtube_video_id ?? null;
    }
  } catch {
    // Videos table may not be present in some environments
  }

  const serializedCall = serializeCall(call);
  const creatorName = creator?.name ?? "Unknown Creator";
  const creatorHandle = creator?.youtube_handle ?? "unknown";
  const ticker = SYMBOL_TICKERS[serializedCall.symbol] ?? serializedCall.symbol.replace("USDT", "");

  const directionLabel = DIRECTION_LABEL[serializedCall.direction];

  // Outcome label is derived (Call has no `outcome` column). When the 30d
  // horizon hasn't elapsed, surface "pending"; otherwise win / loss / flat.
  const outcomeLabel: string =
    serializedCall.is_live_open
      ? "live/open"
      : serializedCall.horizon_status_30d !== "available"
      ? "pending"
      : serializedCall.return_30d === null
        ? "—"
        : serializedCall.return_30d > 0
          ? "win"
          : serializedCall.return_30d < 0
            ? "loss"
            : "flat";

  const targetHitLabel: string =
    serializedCall.target_price === null
      ? "—"
      : serializedCall.target_status !== "available"
        ? "pending"
        : serializedCall.hit_target === true
          ? "yes"
          : serializedCall.hit_target === false
            ? "no"
            : "—";

  const scoreCellValue =
    serializedCall.public_score !== null
      ? serializedCall.public_score.toFixed(1)
      : "—";
  const showLivePerformance = serializedCall.is_live_open && serializedCall.live_return !== null;

  const return30dCellValue =
    serializedCall.return_30d !== null
      ? `${serializedCall.return_30d >= 0 ? "+" : ""}${serializedCall.return_30d.toFixed(1)}%`
      : showLivePerformance
        ? `${serializedCall.live_return >= 0 ? "+" : ""}${serializedCall.live_return.toFixed(1)}%`
        : "—";
  const returnCellLabel =
    serializedCall.return_30d !== null
      ? "30d return"
      : serializedCall.is_live_open
        ? "live return"
        : "30d return";
  const performanceTitle = serializedCall.return_30d !== null
    ? <><em className="italic text-accent">Performance</em> over 30 days.</>
    : showLivePerformance
      ? <><em className="italic text-accent">Live</em> performance.</>
      : <><em className="italic text-accent">Performance</em> pending.</>;
  const performanceMeta = serializedCall.return_30d !== null
    ? <>price vs BTC benchmark<br />window: call date → +30d</>
    : showLivePerformance
      ? <>price vs BTC benchmark<br />window: call date → latest candle</>
      : <>price vs BTC benchmark<br />window pending</>;

  return (
    <div className="max-w-page mx-auto px-4 tab:px-6 desk:px-8 py-12">
      <Link
        href={`/creator/${creatorHandle}`}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-500 hover:text-ink-700 tracking-caps uppercase mb-8"
      >
        <span aria-hidden="true">←</span> {creatorName}
      </Link>

      {/* HERO */}
      <section className="pb-10 border-b border-ink-250">
        <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase mb-2">
          Call · {new Date(serializedCall.call_date).toISOString().slice(0, 10)} · {creatorName}
        </div>
        <h1 className="font-serif text-[35px] tab:text-[45px] text-ink-900 font-medium tracking-tight leading-[1.1] mb-2">
          {ticker}{" "}
          <em className="italic font-normal text-accent">{directionLabel}</em>
        </h1>
        <p className="font-serif text-[17px] text-ink-700 leading-relaxed max-w-[680px]">
          {serializedCall.is_live_open
            ? "Live/open call tracked against the latest Binance candle until the 30-day window closes."
            : "Scored against Binance candles for the 30-day window following the call date."}
          {serializedCall.target_price !== null && (
            <>
              {" "}Target was{" "}
              <em className="italic text-accent">${serializedCall.target_price.toFixed(2)}</em>.
            </>
          )}
        </p>
        <MetaStrip
          cells={[
            { k: "alpha score", v: scoreCellValue },
            { k: returnCellLabel, v: return30dCellValue },
            { k: "outcome", v: outcomeLabel },
            { k: "target hit", v: targetHitLabel },
          ]}
        />
      </section>

      {/* 01 — score breakdown */}
      <EditorialSection index="01" title={<>Score <em className="italic text-accent">breakdown</em>.</>}>
        {serializedCall.public_score_components ? (
          <ScoreBreakdown
            direction={serializedCall.public_score_components.direction}
            alpha={serializedCall.public_score_components.alpha}
            specificity={serializedCall.public_score_components.specificity}
            regime={serializedCall.public_score_components.regime}
            target={serializedCall.public_score_components.target}
          />
        ) : (
          <p className="font-mono text-[12px] text-ink-500 tracking-wide">
            {serializedCall.is_live_open
              ? "This call is live/open. The final public score locks after the 30-day horizon closes."
              : "Score is being computed. Check back after the next pipeline run."}
          </p>
        )}
      </EditorialSection>

      {/* 02 — performance */}
      <EditorialSection
        index="02"
        title={performanceTitle}
        meta={performanceMeta}
      >
        {serializedCall.return_30d !== null ? (
          <dl className="grid grid-cols-2 tab:grid-cols-3 gap-[18px]">
            <div className="border-t border-ink-250 pt-3.5">
              <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
                30d return
              </dt>
              <dd className="font-serif text-[25px] text-ink-900 font-medium tracking-tight tabular-nums">
                {serializedCall.return_30d >= 0 ? "+" : ""}
                {serializedCall.return_30d.toFixed(1)}%
              </dd>
            </div>
            {serializedCall.alpha_30d !== null && (
              <div className="border-t border-ink-250 pt-3.5">
                <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
                  alpha vs BTC
                </dt>
                <dd className="font-serif text-[25px] text-ink-900 font-medium tracking-tight tabular-nums">
                  {serializedCall.alpha_30d >= 0 ? "+" : ""}
                  {serializedCall.alpha_30d.toFixed(1)}%
                </dd>
              </div>
            )}
            {serializedCall.price_30d !== null && (
              <div className="border-t border-ink-250 pt-3.5">
                <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
                  price at +30d
                </dt>
                <dd className="font-serif text-[25px] text-ink-900 font-medium tracking-tight tabular-nums">
                  ${serializedCall.price_30d.toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        ) : showLivePerformance ? (
          <dl className="grid grid-cols-2 tab:grid-cols-3 gap-[18px]">
            <div className="border-t border-ink-250 pt-3.5">
              <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
                live return
              </dt>
              <dd className="font-serif text-[25px] text-ink-900 font-medium tracking-tight tabular-nums">
                {serializedCall.live_return >= 0 ? "+" : ""}
                {serializedCall.live_return.toFixed(1)}%
              </dd>
            </div>
            {serializedCall.live_alpha !== null && (
              <div className="border-t border-ink-250 pt-3.5">
                <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
                  live alpha vs BTC
                </dt>
                <dd className="font-serif text-[25px] text-ink-900 font-medium tracking-tight tabular-nums">
                  {serializedCall.live_alpha >= 0 ? "+" : ""}
                  {serializedCall.live_alpha.toFixed(1)}%
                </dd>
              </div>
            )}
            {serializedCall.live_price !== null && (
              <div className="border-t border-ink-250 pt-3.5">
                <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
                  latest price
                </dt>
                <dd className="font-serif text-[25px] text-ink-900 font-medium tracking-tight tabular-nums">
                  ${serializedCall.live_price.toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <div className="border-t border-ink-250 py-12 text-center">
            <p className="font-mono text-[12px] text-ink-500 tracking-wide">
              Performance data not yet computed for this call.
            </p>
          </div>
        )}
      </EditorialSection>

      {/* 03 — source clip
          Always render the section to preserve index numbering across calls
          (round2-009). Three states: (a) timestamped clip → embed iframe;
          (b) video known but no timestamp → fallback link to full video;
          (c) no video at all → editorial empty-state copy. */}
      <EditorialSection index="03" title={<>Source <em className="italic text-accent">clip</em>.</>}>
        {youtubeVideoId && timestampSeconds !== null ? (
          <div className="aspect-video max-w-[680px] border border-ink-200" style={{ borderRadius: 2 }}>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeVideoId}?start=${timestampSeconds}`}
              title={`${creatorName} — ${ticker} call`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : youtubeVideoId ? (
          <p className="font-serif text-[17px] text-ink-700 leading-relaxed max-w-[680px]">
            Timestamp not yet linked.{" "}
            <a
              href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline decoration-accent/60 underline-offset-4 hover:decoration-accent"
            >
              Open the full video on YouTube →
            </a>
          </p>
        ) : (
          <p className="font-mono text-[12px] text-ink-500 tracking-wide">
            Source clip not yet linked to this call. The transcript is in our pipeline but the video URL is pending.
          </p>
        )}
      </EditorialSection>

      {/* 04 — recompute log
          NOTE: pending real call_audit_log integration. Until then, show ONLY
          the deterministic extraction confidence (no synthesized timestamps).
          Do NOT use new Date() to fake "score computed at" timestamps — that
          would lie about provenance on every render. (round2-006) */}
      <EditorialSection
        index="04"
        title={<>Recompute <em className="italic text-accent">log</em>.</>}
        meta={<>extraction provenance<br />reproduce with: npm run audit:recompute</>}
      >
        {serializedCall.extraction_confidence !== null ? (
          <table className="w-full font-mono text-[12px]">
            <thead>
              <tr className="border-b border-ink-250">
                <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 w-32">When</th>
                <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 w-24">Stage</th>
                <th className="text-left text-[11px] text-ink-500 tracking-caps uppercase font-normal py-2 pl-4">Output</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink-150">
                <td className="py-2.5 text-ink-600 tabular-nums">
                  {new Date(serializedCall.call_date).toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="py-2.5 text-accent">extract</td>
                <td className="py-2.5 pl-4 text-ink-700">
                  Confidence {(serializedCall.extraction_confidence * 100).toFixed(0)}%
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="font-mono text-[12px] text-ink-500 tracking-wide">
            No recompute history yet. This call was scored once at extraction.
          </p>
        )}
        {/* TODO: when call_audit_log table lands, query it for this call.id and
            render real rows. Drop the single-row fallback above. */}
      </EditorialSection>
    </div>
  );
}
