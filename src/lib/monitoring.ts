import { createLogger } from "./logger";

interface MonitoringContext {
  readonly serviceName?: string;
  readonly tags?: Record<string, string | number | boolean | null | undefined>;
  readonly extra?: Record<string, unknown>;
}

interface SentryLike {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, context?: Record<string, unknown>): string;
  flush(timeout?: number): Promise<boolean>;
}

let sentryPromise: Promise<SentryLike | null> | null = null;
let sentryInstance: SentryLike | null = null;
let initialized = false;
let initPromise: Promise<boolean> | null = null;
let initialServiceName: string | undefined;

const monitoringLogger = createLogger({ component: "monitoring" });

async function importSentry(): Promise<SentryLike | null> {
  try {
    // Dynamic specifier prevents TS from requiring @sentry/node type declarations
    // at build time; module is optional at runtime.
    const specifier = "@sentry/node";
    const mod = (await import(/* webpackIgnore: true */ specifier)) as Partial<SentryLike> & {
      default?: Partial<SentryLike>;
    };
    const candidate = (mod.default ?? mod) as Partial<SentryLike>;
    if (
      typeof candidate.init !== "function" ||
      typeof candidate.captureException !== "function" ||
      typeof candidate.flush !== "function"
    ) {
      return null;
    }
    return candidate as SentryLike;
  } catch {
    return null;
  }
}

function hasSentryDsn(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

function cleanRecord<T>(record: Record<string, T | null | undefined>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, T] => entry[1] !== null && entry[1] !== undefined),
  );
}

function parseTracesSampleRate(): number {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (raw === undefined || raw === "") return 0;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0;
  return parsed;
}

async function loadSentry(): Promise<SentryLike | null> {
  if (!hasSentryDsn()) return null;
  sentryPromise ??= importSentry();
  return sentryPromise;
}

export async function initMonitoring(context: MonitoringContext = {}): Promise<boolean> {
  validateServiceName(context.serviceName);
  if (initialized) return sentryInstance !== null;
  if (initPromise) return initPromise;

  // Sentry init is process-wide; only the first serviceName can be applied.
  // Later differing serviceName values are logged and ignored by validation.
  initPromise = (async () => {
    const sentry = await loadSentry();
    if (!sentry) {
      initialized = true;
      return false;
    }
    sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
      serverName: context.serviceName,
      tracesSampleRate: parseTracesSampleRate(),
      enabled: hasSentryDsn(),
    });
    sentryInstance = sentry;
    initialized = true;
    return true;
  })();

  return initPromise;
}

function validateServiceName(serviceName: string | undefined): void {
  if (!serviceName) return;
  if (!initialServiceName) {
    initialServiceName = serviceName;
    return;
  }
  if (serviceName !== initialServiceName) {
    monitoringLogger.warn("monitoring_service_name_ignored", {
      initial_service_name: initialServiceName,
      requested_service_name: serviceName,
    });
  }
}

export async function captureException(
  error: unknown,
  context: MonitoringContext = {},
): Promise<string | undefined> {
  const ready = await initMonitoring(context);
  if (!ready || !sentryInstance) return undefined;
  return sentryInstance.captureException(error, {
    tags: cleanRecord({
      service: context.serviceName,
      ...context.tags,
    }),
    extra: context.extra,
  });
}

export async function flushMonitoring(timeoutMs = 2_000): Promise<boolean> {
  if (!initialized || !sentryInstance) return true;
  return sentryInstance.flush(timeoutMs);
}

export function resetMonitoringForTests(): void {
  sentryPromise = null;
  sentryInstance = null;
  initialized = false;
  initPromise = null;
  initialServiceName = undefined;
}

export function setMonitoringClientForTests(client: SentryLike | null): void {
  sentryPromise = Promise.resolve(client);
}

export async function captureApiException(
  error: unknown,
  route: string,
  extra: Record<string, unknown> = {},
): Promise<string | undefined> {
  return captureException(error, {
    serviceName: "api",
    tags: { route, surface: "api_500" },
    extra,
  });
}
