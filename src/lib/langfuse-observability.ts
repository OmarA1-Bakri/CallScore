import { Langfuse } from "langfuse";

export type LangfuseLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

type Jsonish = unknown;

interface LangfuseLike {
  trace(input: Record<string, unknown>): { id?: string };
  span(input: Record<string, unknown>): unknown;
  generation?(input: Record<string, unknown>): unknown;
  score?(input: Record<string, unknown>): unknown;
  flushAsync?(): Promise<unknown>;
}

export interface LangfuseTraceInput {
  readonly name: string;
  readonly tags?: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly input?: Jsonish;
  readonly output?: Jsonish;
  readonly level?: LangfuseLevel;
}

export interface LangfuseSpanInput {
  readonly traceId: string;
  readonly name: string;
  readonly input?: Jsonish;
  readonly output?: Jsonish;
  readonly metadata?: Record<string, unknown>;
  readonly level?: LangfuseLevel;
}

const SECRET_KEY_RE = /(?:secret|password|token|cookie|credential|authorization|api[_-]?key|public[_-]?key|private[_-]?key|dsn|bearer|session)/i;
const REDACTED = "[REDACTED]";

let client: LangfuseLike | null | undefined;
let injectedClient: LangfuseLike | null | undefined;

function cleanUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

function getClient(): LangfuseLike | null {
  if (injectedClient !== undefined) return injectedClient;
  if (client !== undefined) return client;

  const publicKey = envValue("LANGFUSE_PUBLIC_KEY");
  const secretKey = envValue("LANGFUSE_SECRET_KEY");
  const baseUrl = envValue("LANGFUSE_HOST") ?? "http://127.0.0.1:3000";
  if (!publicKey || !secretKey) {
    client = null;
    return null;
  }

  client = new Langfuse({ publicKey, secretKey, baseUrl });
  return client;
}

export function langfuseObservabilityConfigured(): boolean {
  return getClient() !== null;
}

export function sanitizeLangfusePayload(value: unknown): unknown {
  return sanitizeValue(value, "");
}

function sanitizeValue(value: unknown, key: string): unknown {
  if (SECRET_KEY_RE.test(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…[truncated]` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, ""));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = sanitizeValue(childValue, childKey);
    }
    return out;
  }
  return String(value);
}

export function createLangfuseTrace(input: LangfuseTraceInput): string | null {
  const lf = getClient();
  if (!lf) return null;
  try {
    const trace = lf.trace(cleanUndefined({
      name: input.name,
      tags: input.tags ? [...input.tags] : undefined,
      metadata: input.metadata === undefined ? undefined : sanitizeLangfusePayload(input.metadata) as Record<string, unknown>,
      input: sanitizeLangfusePayload(input.input),
      output: sanitizeLangfusePayload(input.output),
      level: input.level,
    }));
    return typeof trace.id === "string" ? trace.id : null;
  } catch {
    return null;
  }
}

export function traceLangfuseSpan(input: LangfuseSpanInput): void {
  const lf = getClient();
  if (!lf) return;
  try {
    lf.span(cleanUndefined({
      traceId: input.traceId,
      name: input.name,
      input: sanitizeLangfusePayload(input.input),
      output: sanitizeLangfusePayload(input.output),
      metadata: input.metadata === undefined ? undefined : sanitizeLangfusePayload(input.metadata) as Record<string, unknown>,
      level: input.level,
    }));
  } catch {
    // Observability must never break production execution.
  }
}

export async function flushLangfuseObservability(timeoutMs = 2_000): Promise<void> {
  const lf = getClient();
  if (!lf?.flushAsync) return;
  await Promise.race([
    lf.flushAsync().then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function setLangfuseClientForTests(nextClient: LangfuseLike | null): void {
  injectedClient = nextClient;
  client = undefined;
}

export function resetLangfuseObservabilityForTests(): void {
  injectedClient = undefined;
  client = undefined;
}
