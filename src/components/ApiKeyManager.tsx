"use client";

import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ApiKeyRequestRow, ApiKeyReveal, ApiKeyRow } from "@/lib/api-keys";

interface ApiKeyManagerProps {
  readonly initialKeys: readonly ApiKeyRow[];
  readonly initialRequestLogs: readonly ApiKeyRequestRow[];
  readonly initialCreated?: ApiKeyReveal | null;
  readonly initialStatus?: string;
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  return value.slice(0, 10);
}

function CodeBlock({ children }: { readonly children: string }): ReactElement {
  return (
    <pre className="overflow-x-auto border border-ink-250 bg-ink-0 p-3 font-mono text-[12px] leading-relaxed text-ink-700">
      <code>{children}</code>
    </pre>
  );
}

export default function ApiKeyManager({
  initialKeys,
  initialRequestLogs,
  initialCreated = null,
  initialStatus = "",
}: ApiKeyManagerProps): ReactElement {
  const [keys, setKeys] = useState<readonly ApiKeyRow[]>(initialKeys);
  const [name, setName] = useState("Production read key");
  const [created, setCreated] = useState<ApiKeyReveal | null>(initialCreated);
  const [copyStatus, setCopyStatus] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeCount = useMemo(
    () => keys.filter((key) => !key.revoked_at).length,
    [keys],
  );
  const requestCount = initialRequestLogs.length;

  useEffect(() => {
    if (!initialCreated) return;
    void clearRevealCookie();
  }, [initialCreated]);

  async function clearRevealCookie(): Promise<void> {
    try {
      await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ _action: "clear_reveal" }),
      });
    } catch {
      // Best effort cleanup only.
    }
  }

  async function copySecret(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  async function createKey(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    setCopyStatus("");
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as {
        readonly key?: ApiKeyRow;
        readonly secret?: string;
        readonly error?: string;
      };
      if (!response.ok || !data.key || !data.secret) {
        throw new Error(data.error ?? "Failed to create key");
      }
      setKeys((current) => [data.key as ApiKeyRow, ...current]);
      setCreated({
        secret: data.secret,
        prefix: data.key.prefix,
        name: data.key.name,
      });
      setName("Production read key");
      setStatus("Key created. Copy the secret now.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: number): Promise<void> {
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/api-keys?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to revoke key");
      setKeys((current) =>
        current.map((key) =>
          key.id === id
            ? { ...key, revoked_at: new Date().toISOString() }
            : key,
        ),
      );
      setStatus("Key revoked.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
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
            one-time key reveal
          </p>
          <h2 className="mt-3 font-serif text-h3 text-ink-900">
            Copy {created.name} now.
          </h2>
          <p className="mt-2 text-body text-ink-700">
            The secret is shown once. After this panel is dismissed, only the
            prefix remains visible.
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
            <span>prefix {created.prefix}...</span>
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

      <section className="grid gap-4 desk:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={createKey}
          action="/api/api-keys"
          method="post"
          className="border border-ink-250 bg-ink-50 p-4"
        >
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            create key
          </p>
          <label className="mt-4 block">
            <span className="mb-1.5 block font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              Key name
            </span>
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 focus:border-accent focus:outline-none"
            />
          </label>
          {error && (
            <div className="mt-4 border border-neg/40 bg-neg/10 p-3 font-mono text-[12px] text-neg">
              {error}
            </div>
          )}
          <button
            disabled={busy}
            className="mt-4 min-h-11 bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim disabled:opacity-60"
          >
            {busy ? "Creating" : "Create key"}
          </button>
        </form>

        <div className="border border-ink-250 bg-ink-50 p-4">
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            access contract
          </p>
          <dl className="mt-4 grid gap-3 font-mono text-[12px]">
            <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
              <dt className="uppercase tracking-caps text-ink-500">Scopes</dt>
              <dd className="text-right text-ink-800">leaderboard, creators, calls, backtests</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
              <dt className="uppercase tracking-caps text-ink-500">Active keys</dt>
              <dd className="text-right text-ink-800">{activeCount}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-ink-200 pb-2">
              <dt className="uppercase tracking-caps text-ink-500">Rate guidance</dt>
              <dd className="text-right text-ink-800">Cache GETs, back off on 429</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="uppercase tracking-caps text-ink-500">Auth</dt>
              <dd className="text-right text-ink-800">Authorization: Bearer ctr_alpha_...</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="border border-ink-250 bg-ink-50">
        <div className="border-b border-ink-250 p-4">
          <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
            Keys and request activity
          </h2>
        </div>
        {keys.length === 0 ? (
          <div className="p-4 text-sm text-ink-500">
            No keys yet. Create one above to reveal the secret.
          </div>
        ) : (
          <div className="divide-y divide-ink-200">
            {keys.map((key) => (
              <div
                key={key.id}
                className="grid gap-3 p-4 tab:grid-cols-[1fr_auto] tab:items-center"
              >
                <div>
                  <p className="font-mono text-[13px] text-ink-900">
                    {key.name}
                  </p>
                  <p className="font-mono text-[12px] text-ink-500">
                    {key.prefix}... / created {formatDate(key.created_at)} /
                    last used {formatDate(key.last_used_at)} /{" "}
                    {key.revoked_at ? "revoked" : "active"}
                  </p>
                </div>
                {!key.revoked_at && (
                  <form
                    action="/api/api-keys"
                    method="post"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void revokeKey(key.id);
                    }}
                  >
                    <input type="hidden" name="_action" value="revoke" />
                    <input type="hidden" name="id" value={key.id} />
                    <button
                      className="min-h-9 border border-ink-300 px-3 font-mono text-[11px] uppercase tracking-caps text-ink-600 transition-colors hover:border-neg hover:text-neg"
                    >
                      Revoke
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-ink-250 bg-ink-50">
        <div className="border-b border-ink-250 p-4">
          <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
            Request log
          </h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
            {requestCount} recent request{requestCount === 1 ? "" : "s"} recorded
          </p>
        </div>
        {initialRequestLogs.length === 0 ? (
          <div className="p-4 text-sm text-ink-500">
            No API requests recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-ink-200">
            {initialRequestLogs.map((request) => (
              <div
                key={request.id}
                className="grid gap-2 p-4 font-mono text-[12px] tab:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-ink-800">
                    {request.method} {request.path}
                  </p>
                  <p className="text-ink-500">
                    {request.key_name} / {request.key_prefix}...
                  </p>
                </div>
                <p className="text-ink-500">
                  {request.created_at.replace("T", " ").slice(0, 16)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 desk:grid-cols-[1.05fr_0.95fr]">
        <div className="border border-ink-250 bg-ink-50 p-4">
          <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
            Endpoint docs
          </h2>
          <div className="mt-4 space-y-3 font-mono text-[12px] text-ink-700">
            <div className="border border-ink-200 bg-ink-0 p-3">
              <p className="text-ink-900">GET /api/v1/leaderboard</p>
              <p className="mt-1 text-ink-500">Ranked creators with alpha and win-rate fields.</p>
            </div>
            <div className="border border-ink-200 bg-ink-0 p-3">
              <p className="text-ink-900">GET /api/v1/creators</p>
              <p className="mt-1 text-ink-500">Creator directory for handle, tier, and public stats.</p>
            </div>
            <div className="border border-ink-200 bg-ink-0 p-3">
              <p className="text-ink-900">GET /api/v1/calls</p>
              <p className="mt-1 text-ink-500">Recent call stream with creator and symbol context.</p>
            </div>
            <div className="border border-ink-200 bg-ink-0 p-3">
              <p className="text-ink-900">POST /api/v1/backtests</p>
              <p className="mt-1 text-ink-500">Read-only strategy simulation using your chosen creators and dates.</p>
            </div>
          </div>
        </div>
        <div className="border border-ink-250 bg-ink-50 p-4">
          <h2 className="font-mono text-[12px] uppercase tracking-caps text-ink-500">
            Examples
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
                Curl
              </p>
              <CodeBlock>{`curl https://www.call-score.com/api/v1/leaderboard \\
  -H "Authorization: Bearer ctr_alpha_..." \\
  -H "Accept: application/json"`}</CodeBlock>
            </div>
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-caps text-ink-500">
                Fetch
              </p>
              <CodeBlock>{`await fetch("https://www.call-score.com/api/v1/calls", {
  headers: {
    Authorization: "Bearer ctr_alpha_...",
    Accept: "application/json",
  },
});`}</CodeBlock>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
