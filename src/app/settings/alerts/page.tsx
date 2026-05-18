import Link from "next/link";
import SettingsShell from "@/components/SettingsShell";
import { requireSessionAccess } from "@/lib/premium";
import {
  hasAlertUnsubscribe,
  listRecentAlertsForUser,
  listWatchesWithCreators,
} from "@/lib/alerts";
import { creatorHandlePath } from "@/lib/creator-handles";
import { query } from "@/lib/db";

interface PageProps {
  readonly searchParams?: Promise<{
    readonly added?: string;
    readonly removed?: string;
    readonly error?: string;
    readonly q?: string;
  }>;
}

interface CreatorOption {
  readonly id: number;
  readonly name: string;
  readonly youtube_handle: string;
  readonly alpha_score: number;
  readonly accuracy_rank: number | null;
  readonly total_calls: number;
}

async function loadCreatorSuggestions(
  watchedIds: readonly number[],
  searchTerm: string,
): Promise<readonly CreatorOption[]> {
  return query<CreatorOption>(
    `SELECT
       cr.id,
       cr.name,
       cr.youtube_handle,
       COALESCE(cs.alpha_score, cr.alpha_score) AS alpha_score,
       COALESCE(cs.accuracy_rank, cr.accuracy_rank) AS accuracy_rank,
       COALESCE(cs.total_calls, cr.total_calls) AS total_calls
     FROM creators cr
     LEFT JOIN creator_stats cs
       ON cs.creator_id = cr.id AND cs.period = 'all_time'
     WHERE ($1::int[] = '{}'::int[] OR cr.id <> ALL($1::int[]))
       AND (
         $2::text = ''
         OR cr.name ILIKE '%' || $2::text || '%'
         OR cr.youtube_handle ILIKE '%' || $2::text || '%'
       )
     ORDER BY COALESCE(cs.accuracy_rank, cr.accuracy_rank, 999999), cr.name ASC
     LIMIT 16`,
    [watchedIds as number[], searchTerm],
  );
}

function normalizeSearch(value: string | readonly string[] | undefined): string {
  const scalar = Array.isArray(value) ? value[0] : value;
  return (scalar ?? "").trim().slice(0, 80);
}

function StatusNotice({
  added,
  removed,
  error,
}: {
  readonly added?: string;
  readonly removed?: string;
  readonly error?: string;
}) {
  if (error) {
    return (
      <div className="border border-neg/40 bg-neg/10 p-3 font-mono text-[12px] text-neg">
        Creator could not be added. Check the creator id and try again.
      </div>
    );
  }
  if (added) {
    return (
      <div className="border border-pos/40 bg-pos/10 p-3 font-mono text-[12px] text-pos">
        Watch added.
      </div>
    );
  }
  if (removed) {
    return (
      <div className="border border-ink-250 bg-ink-0 p-3 font-mono text-[12px] text-ink-600">
        Watch removed.
      </div>
    );
  }
  return null;
}

export default async function AlertSettingsPage({
  searchParams: searchParamsPromise,
}: PageProps) {
  const searchParams = await searchParamsPromise;
  const session = await requireSessionAccess("pro");
  if (session instanceof Response) {
    const isGuest = session.status === 401;
    return (
      <SettingsShell
        active="alerts"
        title="Alerts"
        description="Watch ranked creators and inspect the outbound delivery queue."
      >
        <section className="border border-ink-250 bg-ink-50 p-5">
          <p className="font-serif text-[19px] text-ink-700">
            {isGuest
              ? "Open this app from your Whop product to access alerts."
              : "Pro unlocks creator watchlists and email alert delivery."}
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0"
          >
            {isGuest ? "View plans" : "Upgrade"}
          </Link>
        </section>
      </SettingsShell>
    );
  }

  const [watches, recentAlerts, unsubscribed] = await Promise.all([
    listWatchesWithCreators(session.userId),
    listRecentAlertsForUser(session.userId, 20),
    hasAlertUnsubscribe(session.userId),
  ]);
  const searchTerm = normalizeSearch(searchParams?.q);
  const suggestions = await loadCreatorSuggestions(
    watches.map((watch) => watch.creator_id),
    searchTerm,
  );

  return (
    <SettingsShell
      active="alerts"
      title="Alerts"
      description="Watch ranked creators, manage delivery scope, and see whether alerts are pending or sent."
      tier={session.tier}
      status={[
        {
          label: "Watches",
          value: String(watches.length),
          tone: watches.length > 0 ? "good" : "warn",
        },
        {
          label: "Email state",
          value: unsubscribed ? "Unsubscribed" : "Deliverable",
          tone: unsubscribed ? "warn" : "good",
        },
        {
          label: "Recent queue",
          value: `${recentAlerts.length} events`,
          tone: "neutral",
        },
      ]}
    >
      <div className="space-y-6">
        <StatusNotice
          added={searchParams?.added}
          removed={searchParams?.removed}
          error={searchParams?.error}
        />

        {unsubscribed && (
          <p className="border border-neg/30 bg-neg/10 p-3 text-sm text-ink-700">
            This account is unsubscribed from alert emails. Add a watch after
            resubscribing support-side to resume delivery.
          </p>
        )}

        <section className="grid gap-4 desk:grid-cols-[1fr_0.85fr]">
          <div className="border border-ink-250 bg-ink-50">
            <div className="border-b border-ink-250 p-4">
              <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
                <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
                Creator picker
              </p>
              <form
                action="/settings/alerts"
                method="get"
                className="mt-4 grid gap-3 tab:grid-cols-[1fr_auto_auto]"
              >
                <label className="block">
                  <span className="mb-1.5 block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
                    Search name or handle
                  </span>
                  <input
                    name="q"
                    defaultValue={searchTerm}
                    placeholder="Crypto Rover"
                    className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
                  />
                </label>
                <button className="self-end min-h-11 bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim">
                  Search
                </button>
                {searchTerm && (
                  <Link
                    href="/settings/alerts"
                    className="inline-flex min-h-11 items-center justify-center self-end border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-600 transition-colors hover:border-ink-500 hover:text-ink-900"
                  >
                    Clear
                  </Link>
                )}
              </form>
            </div>
            <div className="divide-y divide-ink-200">
              {suggestions.length === 0 ? (
                <div className="p-4 text-sm text-ink-500">
                  No creators match that search, or every matching creator is
                  already watched.
                </div>
              ) : (
                suggestions.map((creator) => (
                  <form
                    key={creator.id}
                    action="/api/alerts/watch"
                    method="post"
                    className="grid gap-3 p-4 tab:grid-cols-[1fr_auto] tab:items-center"
                  >
                    <input type="hidden" name="creatorId" value={creator.id} />
                    {searchTerm && <input type="hidden" name="q" value={searchTerm} />}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">
                        {creator.name}
                      </p>
                      <p className="font-mono text-[12px] text-ink-500">
                        {creator.youtube_handle} /{" "}
                        {creator.accuracy_rank ? `rank #${creator.accuracy_rank}` : "unranked"}{" "}
                        / {creator.alpha_score.toFixed(1)} alpha /{" "}
                        {creator.total_calls} calls
                      </p>
                    </div>
                    <button className="min-h-9 border border-ink-300 px-3 font-mono text-[11px] uppercase tracking-caps text-ink-600 transition-colors hover:border-accent hover:text-accent">
                      Watch
                    </button>
                  </form>
                ))
              )}
            </div>
          </div>

          <div className="border border-ink-250 bg-ink-50 p-4">
            <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
              <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
              Delivery rules
            </p>
            <div className="mt-4 space-y-4">
              <fieldset className="border border-ink-250 p-3">
                <legend className="px-1 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
                  Alert events
                </legend>
                <div className="space-y-2 font-mono text-[12px] text-ink-700">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked readOnly className="mt-1 accent-accent" />
                    <span>
                      <span className="block text-ink-900">New scored calls</span>
                      <span className="text-ink-500">Queued when a watched creator resolves.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked readOnly className="mt-1 accent-accent" />
                    <span>
                      <span className="block text-ink-900">Digest queue</span>
                      <span className="text-ink-500">Grouped into the existing outbound worker.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 opacity-75">
                    <input type="checkbox" disabled className="mt-1 accent-accent" />
                    <span>
                      <span className="block text-new">Anti-consensus preview</span>
                      <span className="text-ink-500">Alpha signal delivery waits on consensus backend.</span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="border border-ink-250 p-3">
                <legend className="px-1 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
                  Frequency
                </legend>
                <div className="space-y-2 font-mono text-[12px] text-ink-700">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked readOnly className="accent-accent" />
                    Queue digest
                  </label>
                  <label className="flex items-center gap-2 opacity-75">
                    <input type="radio" disabled className="accent-accent" />
                    Realtime / planned worker
                  </label>
                </div>
              </fieldset>

              <dl className="space-y-3 font-mono text-[12px]">
                <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                  <dt className="uppercase tracking-caps text-ink-500">Delivery target</dt>
                  <dd className="text-right text-ink-800">checkout account email</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
                  <dt className="uppercase tracking-caps text-ink-500">Threshold</dt>
                  <dd className="text-right text-ink-800">eligible calls</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="uppercase tracking-caps text-ink-500">Persistence</dt>
                  <dd className="text-right text-ink-800">watchlist-backed</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Watchlist
            </h2>
          </div>
          {watches.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">
              No watched creators yet. Search by creator name or handle, then
              watch from the picker above.
            </div>
          ) : (
            <div className="divide-y divide-ink-200">
              {watches.map((watch) => (
                <div
                  key={watch.id}
                  className="grid gap-3 p-4 tab:grid-cols-[1fr_auto] tab:items-center"
                >
                  <div>
                    <Link
                      href={`/creator/${creatorHandlePath(watch.youtube_handle)}`}
                      className="font-semibold text-ink-900 hover:text-accent"
                    >
                      {watch.creator_name}
                    </Link>
                    <p className="font-mono text-[12px] text-ink-500">
                      id {watch.creator_id} /{" "}
                      {watch.accuracy_rank ? `rank #${watch.accuracy_rank}` : "unranked"}{" "}
                      / {watch.alpha_score.toFixed(1)} alpha /{" "}
                      {watch.total_calls} calls
                    </p>
                  </div>
                  <form action="/api/alerts/watch" method="post">
                    <input type="hidden" name="_action" value="remove" />
                    <input type="hidden" name="creatorId" value={watch.creator_id} />
                    <button className="min-h-9 border border-ink-300 px-3 font-mono text-[11px] uppercase tracking-caps text-ink-600 transition-colors hover:border-neg hover:text-neg">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Recent alert queue
            </h2>
          </div>
          {recentAlerts.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">No recent alerts.</div>
          ) : (
            <div className="divide-y divide-ink-200">
              {recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="grid gap-2 p-4 font-mono text-[12px] tab:grid-cols-[1fr_auto]"
                >
                  <span className="text-ink-700">
                    {alert.event_type} / {alert.creator_name ?? `creator ${alert.creator_id ?? "any"}`} / call{" "}
                    {alert.call_id ?? "digest"}
                  </span>
                  <span
                    className={alert.sent_at ? "text-pos" : "text-warn"}
                  >
                    {alert.sent_at ? "sent" : "pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </SettingsShell>
  );
}
