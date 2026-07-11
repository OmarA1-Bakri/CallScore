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
  const observedViews = new WeakSet<Element>();

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

  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || capturedViews.has(entry.target)) continue;
      capturedViews.add(entry.target);
      captureElement(entry.target as HTMLElement);
      intersectionObserver.unobserve(entry.target);
    }
  }, { threshold: 0.35 });

  const observeViewElement = (element: HTMLElement): void => {
    if (observedViews.has(element) || capturedViews.has(element)) return;
    observedViews.add(element);
    intersectionObserver.observe(element);
  };

  const observeViews = (root: ParentNode = document): void => {
    if (root instanceof HTMLElement && root.matches("[data-analytics-event][data-analytics-trigger='view']")) {
      observeViewElement(root);
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-analytics-event][data-analytics-trigger='view']")) {
      observeViewElement(element);
    }
  };

  const startViewTracking = (): void => {
    observeViews(document);
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) observeViews(node);
        }
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startViewTracking, { once: true });
  } else {
    startViewTracking();
  }
}
