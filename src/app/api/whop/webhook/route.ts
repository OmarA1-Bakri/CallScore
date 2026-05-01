import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function webhookSecretCandidates(secret: string): readonly Buffer[] {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const candidates = [Buffer.from(secret)];

  try {
    candidates.push(Buffer.from(raw, "base64"));
  } catch {
    // Keep raw candidate only.
  }

  return candidates.filter((candidate) => candidate.length > 0);
}

function verifyStandardWebhookSignature(
  secret: string,
  text: string,
  headers: Headers,
): boolean {
  const webhookId = headers.get("webhook-id");
  const webhookTimestamp = headers.get("webhook-timestamp");
  const webhookSignature =
    headers.get("webhook-signature") ??
    headers.get("x-whop-signature") ??
    headers.get("whop-signature");

  if (!webhookSignature) return false;

  if (webhookId && webhookTimestamp) {
    const signedContent = `${webhookId}.${webhookTimestamp}.${text}`;
    const signatures = webhookSignature.split(" ").flatMap((part) => {
      const [, value] = part.split(",");
      return value ? [value] : [part.replace(/^v1,/, "")];
    });

    for (const candidate of webhookSecretCandidates(secret)) {
      const expected = crypto.createHmac("sha256", candidate).update(signedContent).digest("base64");
      if (signatures.some((signature) => timingSafeEqual(signature, expected))) return true;
    }
  }

  const legacyReceived = webhookSignature.replace(/^sha256=/, "");
  const legacyExpected = crypto.createHmac("sha256", secret).update(text).digest("hex");
  return timingSafeEqual(legacyReceived, legacyExpected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookKey = process.env.WHOP_WEBHOOK_KEY;
  const text = await request.text();
  if (webhookKey && !verifyStandardWebhookSignature(webhookKey, text, request.headers)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(text || "null") as unknown;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  // Whop remains source of truth via getUserTier on login/API access. This
  // endpoint acknowledges membership events so the dashboard webhook has a
  // concrete target; persistent entitlement mirroring can be added here later.
  return NextResponse.json({ ok: true });
}
