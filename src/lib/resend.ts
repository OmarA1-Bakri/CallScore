/**
 * Minimal Resend email adapter. Uses plain fetch to avoid pulling in the
 * Resend SDK — the project aims to stay dependency-light.
 *
 * Required env vars:
 *   - RESEND_API_KEY      — Resend API key (sk_live_... / sk_test_...)
 *   - RESEND_FROM_EMAIL   — verified sender address, e.g. "alerts@cryptotubersranked.com"
 */

export interface SendEmailInput {
  readonly to: string | readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface SendEmailResult {
  readonly id: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;

/**
 * Thrown when the Resend HTTP call exceeds RESEND_TIMEOUT_MS. Callers
 * (cron jobs) can catch this specifically to distinguish transient
 * network timeouts from permanent failures (non-2xx responses).
 */
export class ResendTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Resend request timed out after ${timeoutMs}ms`);
    this.name = "ResendTimeoutError";
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} not configured`);
  }
  return value;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM_EMAIL");

  const body = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    // AbortError from AbortSignal.timeout() — surface as a distinct
    // typed error so cron can log + retry without conflating with
    // non-2xx application errors.
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new ResendTimeoutError(RESEND_TIMEOUT_MS);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend request failed (${response.status}): ${detail.slice(0, 400)}`,
    );
  }

  const parsed = (await response.json()) as { readonly id?: string };
  if (!parsed.id) {
    throw new Error("Resend response missing id");
  }
  return { id: parsed.id };
}
