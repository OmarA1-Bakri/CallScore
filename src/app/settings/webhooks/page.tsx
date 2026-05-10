import { cookies } from "next/headers";
import Link from "next/link";
import SettingsShell from "@/components/SettingsShell";
import WebhookManager from "@/components/WebhookManager";
import { requireSessionAccess } from "@/lib/premium";
import {
  listWebhookDeliveries,
  listWebhooks,
  parseWebhookRevealCookieValue,
  WEBHOOK_REVEAL_COOKIE_NAME,
} from "@/lib/webhooks";

const WEBHOOKS_ROUTE = "/api/webhooks";

interface PageProps {
  readonly searchParams?: {
    readonly disabled?: string;
    readonly error?: string;
    readonly tested?: string;
  };
}

export default async function WebhookSettingsPage({
  searchParams,
}: PageProps) {
  const session = await requireSessionAccess("alpha");
  if (session instanceof Response) {
    const isGuest = session.status === 401;
    return (
      <SettingsShell
        active="webhooks"
        title="Webhooks"
        description="Send signed notifications to your own systems."
      >
        <section className="border border-ink-250 bg-ink-50 p-5">
          <p className="text-ink-700 mb-4">
            {isGuest
              ? "Sign in through Whop to access webhook features."
              : "Alpha unlocks signed webhook notifications and delivery logs."}
          </p>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center bg-accent px-4 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0"
          >
            {isGuest ? "View plans" : "Upgrade to Alpha"}
          </Link>
        </section>
      </SettingsShell>
    );
  }

  const [webhooks, deliveries] = await Promise.all([
    listWebhooks(session.userId),
    listWebhookDeliveries(session.userId, 20),
  ]);
  const activeCount = webhooks.filter((webhook) => webhook.active).length;
  const lastDelivery = deliveries[0];
  const cookieStore = await cookies();
  const createdReveal = parseWebhookRevealCookieValue(
    cookieStore.get(WEBHOOK_REVEAL_COOKIE_NAME)?.value,
  );

  return (
    <SettingsShell
      active="webhooks"
      title="Webhooks"
      description="Manage signed endpoints, test deliveries, and inspect retry history."
      tier={session.tier}
      status={[
        {
          label: "Endpoints",
          value: `${activeCount} active`,
          tone: activeCount > 0 ? "good" : "warn",
        },
        {
          label: "Last delivery",
          value: lastDelivery
            ? lastDelivery.ok
              ? "ok"
              : "failed"
            : "none",
          tone: lastDelivery ? (lastDelivery.ok ? "good" : "warn") : "neutral",
        },
        { label: "Retry policy", value: "3 attempts", tone: "neutral" },
      ]}
    >
      <WebhookManager
        initialWebhooks={webhooks}
        initialDeliveries={deliveries}
        initialCreated={createdReveal}
        initialStatus={
          searchParams?.error === "invalid_https_url"
            ? ""
            : searchParams?.disabled
              ? "Webhook disabled."
              : searchParams?.tested
                ? "Test delivery recorded."
                : ""
        }
        initialError={
          searchParams?.error === "invalid_https_url"
            ? "Webhook URLs must start with https://."
            : ""
        }
      />
    </SettingsShell>
  );
}
