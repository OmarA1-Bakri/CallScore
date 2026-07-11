export const CALLSCORE_FUNNEL_EVENTS = [
  "landing_view",
  "leaderboard_view",
  "pricing_view",
  "checkout_started",
  "checkout_completed",
  "checkout_cancelled",
  "entitlement_activated",
  "paid_feature_used",
] as const;

export type CallScoreFunnelEvent = (typeof CALLSCORE_FUNNEL_EVENTS)[number];
export type AnalyticsScalar = string | number | boolean;
export type AnalyticsProperties = Readonly<Record<string, AnalyticsScalar>>;
export type AnalyticsInputProperties = Readonly<Record<string, unknown>>;
export type AnalyticsTrigger = "click" | "view";

export interface PostHogClientConfig {
  readonly token: string;
  readonly host: string;
}

function boundedProperties(value: unknown): Record<string, AnalyticsScalar> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, AnalyticsScalar> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(result).length >= 24) break;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      result[key] = item;
    }
  }
  return result;
}

export function postHogClientConfig(env: Readonly<Record<string, string | undefined>>): PostHogClientConfig | null {
  const token = env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  const rawHost = env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!token || !rawHost) return null;
  try {
    const url = new URL(rawHost);
    if (url.protocol !== "https:") return null;
    return { token, host: url.origin };
  } catch {
    return null;
  }
}

export function analyticsDataset(
  event: CallScoreFunnelEvent,
  properties: AnalyticsInputProperties = {},
  trigger: AnalyticsTrigger = "click",
): Record<string, string> {
  return {
    "data-analytics-event": event,
    "data-analytics-properties": JSON.stringify(boundedProperties(properties)),
    "data-analytics-trigger": trigger,
  };
}

export function parseAnalyticsProperties(raw: string | null | undefined): Record<string, AnalyticsScalar> {
  if (!raw) return {};
  try {
    return boundedProperties(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function capturePostHogEvent(
  config: PostHogClientConfig,
  event: CallScoreFunnelEvent,
  distinctId: string,
  properties: AnalyticsInputProperties = {},
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!distinctId.trim() || !CALLSCORE_FUNNEL_EVENTS.includes(event)) return false;
  try {
    const response = await fetcher(`${config.host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: config.token,
        event,
        properties: {
          distinct_id: distinctId,
          ...boundedProperties(properties),
        },
      }),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}
