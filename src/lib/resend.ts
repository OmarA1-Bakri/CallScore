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

function readApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error("RESEND_API_KEY is required to send alerts email");
  }
  return key;
}

function readFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from || from.trim().length === 0) {
    throw new Error("RESEND_FROM_EMAIL is required to send alerts email");
  }
  return from;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = readApiKey();
  const from = readFromAddress();

  const body = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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
