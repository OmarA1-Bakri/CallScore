import { cookies } from "next/headers";
import Link from "next/link";
import ApiKeyManager from "@/components/ApiKeyManager";
import SettingsShell from "@/components/SettingsShell";
import { requireSessionAccess } from "@/lib/premium";
import {
  API_KEY_REVEAL_COOKIE_NAME,
  listApiKeyRequests,
  listApiKeys,
  parseApiKeyRevealCookieValue,
} from "@/lib/api-keys";

const API_KEYS_ROUTE = "/api/api-keys";

interface PageProps {
  readonly searchParams?: Promise<{
    readonly created?: string;
    readonly revoked?: string;
  }>;
}

export default async function ApiSettingsPage({
  searchParams: searchParamsPromise,
}: PageProps) {
  const searchParams = await searchParamsPromise;
  const session = await requireSessionAccess("alpha");
  if (session instanceof Response) {
    const isGuest = session.status === 401;
    return (
      <SettingsShell
        active="api"
        title="API Access"
        description="Create read-only keys for programmatic access."
      >
        <section className="border border-ink-250 bg-ink-50 p-5">
          <p className="text-ink-700 mb-4">
            {isGuest
              ? "Sign in first to inspect API access and key state."
              : "Alpha unlocks read-only API keys and Backtest Lab endpoints."}
          </p>
          <Link
            href={isGuest ? "/api/auth/whop" : "/pricing"}
            prefetch={isGuest ? false : undefined}
            className="inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0"
          >
            {isGuest ? "Sign in" : "Upgrade to Alpha"}
          </Link>
        </section>
      </SettingsShell>
    );
  }

  const [keys, requestLogs] = await Promise.all([
    listApiKeys(session.userId),
    listApiKeyRequests(session.userId, 20),
  ]);
  const activeKeys = keys.filter((key) => !key.revoked_at).length;
  const cookieStore = await cookies();
  const createdReveal = parseApiKeyRevealCookieValue(
    cookieStore.get(API_KEY_REVEAL_COOKIE_NAME)?.value,
  );

  return (
    <SettingsShell
      active="api"
      title="API Access"
      description="Manage read-only keys, inspect request activity, and copy integration examples."
      tier={session.tier}
      status={[
        {
          label: "Keys",
          value: `${activeKeys} active`,
          tone: activeKeys > 0 ? "good" : "warn",
        },
        { label: "Scope", value: "Read-only", tone: "neutral" },
        { label: "Rate limit", value: "Published in docs", tone: "neutral" },
      ]}
    >
      <ApiKeyManager
        // API key forms post to API_KEYS_ROUTE via the client manager.
        initialKeys={keys}
        initialRequestLogs={requestLogs}
        initialCreated={createdReveal}
        initialStatus={
          searchParams?.revoked
            ? "Key revoked."
            : searchParams?.created && !createdReveal
              ? "Key created. The secret can only be shown during the redirect handoff."
              : ""
        }
      />
    </SettingsShell>
  );
}
