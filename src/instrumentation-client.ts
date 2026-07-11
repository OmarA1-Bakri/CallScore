import {
  CALLSCORE_FUNNEL_EVENTS,
  capturePostHogEvent,
  parseAnalyticsProperties,
  postHogClientConfig,
  type CallScoreFunnelEvent,
} from "./lib/conversion-analytics";

const config = postHogClientConfig({
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});

function visitorId(): string {
  const key = "callscore_analytics_distinct_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return window.crypto.randomUUID();
  }
}

function isFunnelEvent(value: string | undefined): value is CallScoreFunnelEvent {
  return Boolean(value && CALLSCORE_FUNNEL_EVENTS.includes(value as CallScoreFunnelEvent));
}

function attribution(): Record<string, string> {
  const query = new URLSearchParams(window.location.search);
  return {
    path: window.location.pathname,
    url: window.location.href,
    referrer: document.referrer,
    utm_source: query.get("utm_source") ?? "",
    utm_medium: query.get("utm_medium") ?? "",
    utm_campaign: query.get("utm_campaign") ?? "",
    utm_content: query.get("utm_content") ?? "",
  };
}

if (config && typeof window !== "undefined") {
  const distinctId = visitorId();
  const capturedViews = new WeakSet<Element>();

  const captureElement = (element: HTMLElement): void => {
    const event = element.dataset.analyticsEvent;
    if (!isFunnelEvent(event)) return;
    void capturePostHogEvent(config, event, distinctId, {
      ...attribution(),
      ...parseAnalyticsProperties(element.dataset.analyticsProperties),
    });
  };

  document.addEventListener("click", (clickEvent) => {
    const target = clickEvent.target;
    if (!(target instanceof Element)) return;
    const element = target.closest<HTMLElement>("[data-analytics-event][data-analytics-trigger='click']");
    if (element) captureElement(element);
  });

  const observeViews = (): void => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || capturedViews.has(entry.target)) continue;
        capturedViews.add(entry.target);
        captureElement(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.35 });

    for (const element of document.querySelectorAll<HTMLElement>("[data-analytics-event][data-analytics-trigger='view']")) {
      observer.observe(element);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeViews, { once: true });
  } else {
    observeViews();
  }
}
