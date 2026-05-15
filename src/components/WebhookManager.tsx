"use client";

import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import type { WebhookDeliveryRow, WebhookReveal, WebhookRow } from "@/lib/webhooks";

interface WebhookManagerProps {
  readonly initialWebhooks: readonly WebhookRow[];
  readonly initialDeliveries: readonly WebhookDeliveryRow[];
  readonly initialCreated?: WebhookReveal | null;
  readonly initialStatus?: string;
  readonly initialError?: string;
}

const EVENTS = [
  {
    id: "new_call_digest",
    label: "new_call_digest",
    description: "Queued creator watchlist activity.",
  },
  {
    id: "consensus_signal",
    label: "consensus_signal",
    description: "Consensus and convergence events.",
  },
] as const;

const DELIVERY_ATTEMPTS = 3;

function formatDate(value: unknown): string {
  if (!value) return "never";
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  return normalized.replace("T", " ").slice(0, 16);
}

function eventSchema(type: string, body: string): ReactElement {
  return (
    <pre
      className="overflow-x-auto border border-ink-250 bg-ink-0 p-3 font-mono text-[12px] leading-relaxed text-ink-700 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      tabIndex={0}
      aria-label={`${type} webhook event schema`}
    >
      <code>{`{
  "type": "new_call_digest",
  "created_at": "2026-05-04T00:00:00.000Z",
  "data": ${body}
}`.replace('"new_call_digest"', `"${type}"`)}</code>
    </pre>
  );
}

function deliveryState(delivery: WebhookDeliveryRow): {
  readonly label: string;
  readonly tone: string;
} {
  if (delivery.ok) return { label: "delivered", tone: "text-pos" };
  if (delivery.attempts >= DELIVERY_ATTEMPTS) {
    return { label: "failed after retries", tone: "text-neg" };
  }
  return { label: "retrying", tone: "text-warn" };
}

export default function WebhookManager({
  initialWebhooks,
  initialDeliveries,
  initialCreated = null,
  initialStatus = "",
  initialError = "",
}: WebhookManagerProps): ReactElement {
  const [webhooks, setWebhooks] =
    useState<readonly WebhookRow[]>(initialWebhooks);
  const [deliveries, setDeliveries] =
    useState<readonly WebhookDeliveryRow[]>(initialDeliveries);
  const [url, setUrl] = useState("");
  const [eventTypes, setEventTypes] = useState<readonly string[]>([
    "new_call_digest",
    "consensus_signal",
  ]);
  const [created, setCreated] = useState<WebhookReveal | null>(initialCreated);
  const [copyStatus, setCopyStatus] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  const activeCount = useMemo(
    () => webhooks.filter((webhook) => webhook.active).length,
    [webhooks],
  );

  useEffect(() => {
    if (!initialCreated) return;
    void clearRevealCookie();
  }, [initialCreated]);

  async function clearRevealCookie(): Promise<void> {
    try {
      await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _action: "clear_reveal" }),
      });
    } catch {
      // Best effort cleanup only.
    }
  }

  function toggleEvent(value: string): void {
    setEventTypes((current) => {
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return next.length === 0 ? current : next;
    });
  }

  async function copySecret(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  async function createWebhook(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    setCopyStatus("");
    setTestStatus("");
    try {
      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, eventTypes }),
      });
      const data = (await response.json()) as {
        readonly webhook?: WebhookRow;
        readonly secret?: string;
        readonly error?: string;
      };
      if (!response.ok || !data.webhook || !data.secret) {
        throw new Error(data.error ?? "Failed to create webhook");
      }
      const webhook = data.webhook;
      setWebhooks((current) => [webhook, ...current]);
      setCreated({ url: webhook.url, secret: data.secret });
      setUrl("");
      setStatus("Webhook created. Copy the signing secret now.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setBusy(false);
    }
  }

  async function disableWebhook(id: number): Promise<void> {
    setError("");
    setStatus("");
    setTestStatus("");
    try {
      const response = await fetch(`/api/webhooks?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to disable webhook");
      setWebhooks((current) =>
        current.map((webhook) =>
          webhook.id === id ? { ...webhook, active: false } : webhook,
        ),
      );
      setStatus("Webhook disabled.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disable webhook");
    }
  }

  async function testWebhook(id: number): Promise<void> {
    setTestStatus("");
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _action: "test", id }),
      });
      const data = (await response.json()) as {
        readonly ok?: boolean;
        readonly delivery?: WebhookDeliveryRow | null;
      };
      if (!response.ok) throw new Error("Failed to send test webhook");
      if (!data.ok || !data.delivery) {
        setTestStatus("Active webhook not found.");
        return;
      }
      setDeliveries((current) => [data.delivery!, ...current].slice(0, 20));
      setTestStatus(
        data.delivery.ok
          ? "Test delivered."
          : "Test failed after retries. Check the delivery log.",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send test webhook");
    }
  }

  async function dismissCreated(): Promise<void> {
    setCreated(null);
    setCopyStatus("");
    await clearRevealCookie();
  }

  return (
    <div className="space-y-6">
      {status && !error && (
        <div className="border border-pos/40 bg-pos/10 p-3 font-mono text-[12px] text-pos">
          {status}
        </div>
      )}

      {created && (
        <section className="border border-accent-dim bg-accent-low p-4">
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            signing secret
          </p>
          <h2 className="mt-3 font-serif text-h3 text-ink-900">
            Copy the secret for {created.url}.
          </h2>
          <p className="mt-2 text-body text-ink-700">
            Verify `x-ctr-signature` with HMAC-SHA256 over the raw request body.
          </p>
          <div className="mt-4 grid gap-2 tab:grid-cols-[1fr_auto]">
            <input
              readOnly
              value={created.secret}
              className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-[12px] text-ink-800"
            />
            <button
              type="button"
              onClick={() => copySecret(created.secret)}
              className="min-h-11 border border-accent px-4 font-mono text-mono-sm uppercase tracking-caps text-accent transition-colors hover:bg-accent hover:text-ink-0"
            >
              Copy
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-caps text-ink-500">
            {copyStatus && <span className="text-ink-800">{copyStatus}</span>}
            <button
              type="button"
              onClick={() => void dismissCreated()}
              className="text-ink-600 hover:text-ink-900"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      <section className="grid min-w-0 gap-4 desk:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={createWebhook}
          action="/api/webhooks"
          method="post"
          className="min-w-0 border border-ink-250 bg-ink-50 p-4"
        >
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            add endpoint
          </p>
          <label className="mt-4 block">
            <span className="mb-1.5 block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              HTTPS URL
            </span>
            <input
              name="url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/callscore/webhook"
              className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
            />
          </label>
          <fieldset className="mt-4 border border-ink-250 p-3">
            <legend className="px-1 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              Events
            </legend>
            <div className="space-y-2">
              {EVENTS.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-2 font-mono text-[12px] text-ink-700"
                >
                  <input
                    name="eventTypes"
                    value={item.id}
                    type="checkbox"
                    checked={eventTypes.includes(item.id)}
                    onChange={() => toggleEvent(item.id)}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block text-ink-900">{item.label}</span>
                    <span className="text-ink-500">{item.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <div className="mt-4 border border-neg/40 bg-neg/10 p-3 font-mono text-[12px] text-neg">
              {error}
            </div>
          )}
          <button
            disabled={busy}
            className="mt-4 min-h-11 bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim disabled:opacity-60"
          >
            {busy ? "Adding" : "Add webhook"}
          </button>
        </form>

        <div className="min-w-0 border border-ink-250 bg-ink-50 p-4">
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            delivery contract
          </p>
          <dl className="mt-4 space-y-3 font-mono text-[12px]">
            <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
              <dt className="uppercase tracking-caps text-ink-500">Active URLs</dt>
              <dd className="text-right text-ink-800">{activeCount}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
              <dt className="uppercase tracking-caps text-ink-500">Retries</dt>
              <dd className="text-right text-ink-800">3 attempts with one signed payload per try</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
              <dt className="uppercase tracking-caps text-ink-500">Signature</dt>
              <dd className="text-right text-ink-800">x-ctr-signature</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="uppercase tracking-caps text-ink-500">Failure state</dt>
              <dd className="text-right text-ink-800">delivery log records status, attempts, and error text</dd>
            </div>
          </dl>
          {testStatus && (
            <div className="mt-4 border border-pos/40 bg-pos/10 p-3 font-mono text-[12px] text-pos">
              {testStatus}
            </div>
          )}
        </div>
      </section>

      <section className="border border-ink-250 bg-ink-50">
        <div className="border-b border-ink-250 p-4">
          <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
            Endpoints
          </h2>
        </div>
        {webhooks.length === 0 ? (
          <div className="p-4 text-sm text-ink-500">
            No webhook endpoints yet.
          </div>
        ) : (
          <div className="divide-y divide-ink-200">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="grid gap-3 p-4 desk:grid-cols-[1fr_auto] desk:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[13px] text-ink-900">
                    {webhook.url}
                  </p>
                  <p className="font-mono text-[12px] text-ink-500">
                    created {formatDate(webhook.created_at)} /{" "}
                    {webhook.event_types.join(", ")} /{" "}
                    {webhook.active ? "active" : "inactive"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {webhook.active && (
                    <>
                      <form
                        action="/api/webhooks"
                        method="post"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void testWebhook(webhook.id);
                        }}
                      >
                        <input type="hidden" name="_action" value="test" />
                        <input type="hidden" name="id" value={webhook.id} />
                        <button
                          className="min-h-9 border border-ink-300 px-3 font-mono text-[11px] uppercase tracking-caps text-ink-600 transition-colors hover:border-accent hover:text-accent"
                        >
                          Test
                        </button>
                      </form>
                      <form
                        action="/api/webhooks"
                        method="post"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void disableWebhook(webhook.id);
                        }}
                      >
                        <input type="hidden" name="_action" value="delete" />
                        <input type="hidden" name="id" value={webhook.id} />
                        <button
                          className="min-h-9 border border-ink-300 px-3 font-mono text-[11px] uppercase tracking-caps text-ink-600 transition-colors hover:border-neg hover:text-neg"
                        >
                          Disable
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 desk:grid-cols-2">
        <div className="border border-ink-250 bg-ink-50 p-4">
          <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
            Event schema
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
                new_call_digest
              </p>
              {eventSchema(
                "new_call_digest",
                `{
    "creator_id": 123,
    "call_id": 456,
    "symbol": "BTCUSDT"
  }`,
              )}
            </div>
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
                consensus_signal
              </p>
              {eventSchema(
                "consensus_signal",
                `{
    "signal_id": 42,
    "symbol": "ETH",
    "direction": "bullish"
  }`,
              )}
            </div>
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
                test.ping
              </p>
              {eventSchema(
                "test.ping",
                `{
    "message": "CallScore webhook test",
    "webhook_id": 9
  }`,
              )}
            </div>
          </div>
        </div>

        <div className="border border-ink-250 bg-ink-50">
          <div className="border-b border-ink-250 p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
              Delivery log
            </h2>
          </div>
          {deliveries.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">
              No deliveries recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-ink-200">
              {deliveries.map((delivery) => {
                const state = deliveryState(delivery);
                return (
                  <div key={delivery.id} className="p-4 font-mono text-[12px]">
                    <div className="flex justify-between gap-4">
                      <span className="text-ink-800">{delivery.event_type}</span>
                      <span className={state.tone}>{state.label}</span>
                    </div>
                    <p className="mt-1 truncate text-ink-500">{delivery.url}</p>
                    <p className="mt-1 text-ink-500">
                      {formatDate(delivery.created_at)} / status{" "}
                      {delivery.status ?? "none"} / attempts {delivery.attempts}
                    </p>
                    {delivery.error && (
                      <p className="mt-1 truncate text-neg">{delivery.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
