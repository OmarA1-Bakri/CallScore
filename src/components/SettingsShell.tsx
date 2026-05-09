import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

type SettingsTab =
  | "account"
  | "billing"
  | "alerts"
  | "api"
  | "webhooks"
  | "notifications"
  | "team";

interface SettingsShellProps {
  readonly active: SettingsTab;
  readonly title: string;
  readonly description?: string;
  readonly tier?: string;
  readonly primaryAction?: {
    readonly label: string;
    readonly href: string;
    readonly prefetch?: boolean;
  };
  readonly secondaryAction?: {
    readonly label: string;
    readonly href: string;
    readonly prefetch?: boolean;
  };
  readonly status?: readonly {
    readonly label: string;
    readonly value: string;
    readonly tone?: "neutral" | "good" | "warn";
  }[];
  readonly children: ReactNode;
}

const SETTINGS_TABS: readonly {
  readonly id: SettingsTab;
  readonly label: string;
  readonly href: string;
  readonly meta: string;
}[] = [
  {
    id: "account",
    label: "Account",
    href: "/settings/account",
    meta: "Base",
  },
  {
    id: "billing",
    label: "Billing",
    href: "/settings/billing",
    meta: "Whop",
  },
  {
    id: "alerts",
    label: "Alerts",
    href: "/settings/alerts",
    meta: "Pro",
  },
  {
    id: "api",
    label: "API Keys",
    href: "/settings/api",
    meta: "Alpha",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    href: "/settings/webhooks",
    meta: "Alpha",
  },
  {
    id: "notifications",
    label: "Notifications",
    href: "/settings/notifications",
    meta: "Planned",
  },
  {
    id: "team",
    label: "Team",
    href: "/settings/team",
    meta: "Planned",
  },
];

export default function SettingsShell({
  active,
  title,
  description,
  tier,
  primaryAction,
  secondaryAction,
  status,
  children,
}: SettingsShellProps): ReactElement {
  const statusRows =
    status ??
    [
      { label: "Session", value: tier ? "Verified" : "Locked", tone: tier ? "good" : "warn" },
      { label: "Plan", value: tier ?? "Upgrade", tone: tier ? "neutral" : "warn" },
      { label: "Surfaces", value: "Account / Billing / Delivery", tone: "neutral" },
    ] as const;

  return (
    <div className="mx-auto max-w-page px-4 py-10 tab:px-6 desk:px-8">
      <div className="mb-8 border-b border-ink-250 pb-6">
        <div className="flex flex-col gap-4 tab:flex-row tab:items-end tab:justify-between">
          <div>
            <p className="mb-2 font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              Settings
            </p>
            <h1 className="font-serif text-[35px] font-medium leading-tight text-ink-900">
              {title}
            </h1>
            {description && (
              <p className="mt-3 max-w-[680px] font-serif text-[17px] leading-relaxed text-ink-700">
                {description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-fit border border-ink-250 bg-ink-50 px-3 py-2 font-mono text-mono-sm uppercase tracking-caps text-ink-600">
              Plan <span className="text-ink-900">{tier ?? "free"}</span>
            </div>
            {secondaryAction && (
              <Link
                href={secondaryAction.href}
                prefetch={secondaryAction.prefetch}
                className="inline-flex min-h-10 items-center border border-ink-300 px-3 font-mono text-mono-sm uppercase tracking-caps text-ink-700 transition-colors hover:border-ink-500 hover:text-ink-900"
              >
                {secondaryAction.label}
              </Link>
            )}
            {primaryAction && (
              <Link
                href={primaryAction.href}
                prefetch={primaryAction.prefetch}
                className="inline-flex min-h-10 items-center bg-accent px-3 font-mono text-mono-sm font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim"
              >
                {primaryAction.label}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8 grid border border-ink-250 bg-ink-50 tab:grid-cols-3">
        {statusRows.map((row) => (
          <div
            key={row.label}
            className="border-b border-ink-200 p-3 last:border-b-0 tab:border-b-0 tab:border-r tab:last:border-r-0"
          >
            <p className="font-mono text-mono-sm uppercase tracking-caps text-ink-500">
              {row.label}
            </p>
            <p
              className={`mt-1 font-mono text-[13px] tabular-nums ${
                row.tone === "good"
                  ? "text-pos"
                  : row.tone === "warn"
                    ? "text-warn"
                    : "text-ink-800"
              }`}
            >
              {row.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-8 tab:grid-cols-[200px_1fr] desk:grid-cols-[220px_1fr]">
        <aside
          className="min-w-0 tab:sticky tab:top-32 tab:self-start"
          aria-label="Settings navigation"
        >
          <nav className="-mx-4 overflow-hidden px-4 tab:mx-0 tab:overflow-visible tab:px-0">
            <div className="flex w-full min-w-0 max-w-full gap-1 overflow-x-auto border-b border-ink-250 pb-2 tab:block tab:space-y-1 tab:overflow-visible tab:border-b-0 tab:pb-0">
              {SETTINGS_TABS.map((item) => {
                const selected = item.id === active;
                const className = `flex min-h-10 min-w-fit items-center justify-between gap-4 border-b px-3 py-2 font-mono text-mono-sm uppercase tracking-caps transition-colors tab:border-b-0 tab:border-l-2 ${
                  selected
                    ? "border-accent bg-ink-50 text-ink-900"
                    : "border-transparent text-ink-600 hover:text-ink-800"
                }`;
                const content = (
                  <>
                    <span>{item.label}</span>
                    <span className="text-[10px] text-ink-600">{item.meta}</span>
                  </>
                );
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={selected ? "page" : undefined}
                    className={className}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
