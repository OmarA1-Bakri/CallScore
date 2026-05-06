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
let initialized = false;
const importSentry = new Function("return import('@sentry/node')") as () => Promise<SentryLike>;

function hasSentryDsn(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

function cleanRecord<T>(record: Record<string, T | null | undefined>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, T] => entry[1] !== null && entry[1] !== undefined),
  );
}

async function loadSentry(): Promise<SentryLike | null> {
  if (!hasSentryDsn()) return null;
  sentryPromise ??= importSentry().catch(() => {
    return null;
  });
  return sentryPromise;
}

export async function initMonitoring(context: MonitoringContext = {}): Promise<boolean> {
  const sentry = await loadSentry();
  if (!sentry) return false;
  if (!initialized) {
    sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
      serverName: context.serviceName,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      enabled: hasSentryDsn(),
    });
    initialized = true;
  }
  return true;
}

export async function captureException(
  error: unknown,
  context: MonitoringContext = {},
): Promise<string | undefined> {
  const ready = await initMonitoring(context);
  if (!ready) return undefined;
  const sentry = await loadSentry();
  if (!sentry) return undefined;
  return sentry.captureException(error, {
    tags: cleanRecord({
      service: context.serviceName,
      ...context.tags,
    }),
    extra: context.extra,
  });
}

export async function flushMonitoring(timeoutMs = 2_000): Promise<boolean> {
  const sentry = await loadSentry();
  if (!sentry || !initialized) return true;
  return sentry.flush(timeoutMs);
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
