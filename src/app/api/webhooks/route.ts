import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  createWebhook,
  createWebhookRevealCookieValue,
  deleteWebhook,
  deliverWebhookTest,
  listWebhooks,
  WEBHOOK_REVEAL_COOKIE_NAME,
} from "@/lib/webhooks";
import { requireSessionAccess } from "@/lib/premium";

export const runtime = "nodejs";

const REVEAL_COOKIE_MAX_AGE_SECONDS = 5 * 60;

function revealCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: REVEAL_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function GET(): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ webhooks: await listWebhooks(session.userId) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const cookieStore = await cookies();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (form.get("_action") === "clear_reveal") {
      cookieStore.delete(WEBHOOK_REVEAL_COOKIE_NAME);
      return NextResponse.redirect(new URL("/settings/webhooks", request.url), 303);
    }
    if (form.get("_action") === "delete") {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "invalid_id" }, { status: 400 });
      }
      await deleteWebhook(session.userId, id);
      return NextResponse.redirect(new URL("/settings/webhooks?disabled=1", request.url), 303);
    }
    if (form.get("_action") === "test") {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "invalid_id" }, { status: 400 });
      }
      await deliverWebhookTest(session.userId, id);
      return NextResponse.redirect(new URL("/settings/webhooks?tested=1", request.url), 303);
    }
    const webhook = await createWebhook(session.userId, String(form.get("url") ?? ""), form.getAll("eventTypes"));
    if (!webhook) {
      return NextResponse.redirect(
        new URL("/settings/webhooks?error=invalid_https_url", request.url),
        303,
      );
    }
    cookieStore.set(
      WEBHOOK_REVEAL_COOKIE_NAME,
      createWebhookRevealCookieValue({
        url: webhook.url,
        secret: webhook.secret,
      }),
      revealCookieOptions(),
    );
    return NextResponse.redirect(new URL("/settings/webhooks", request.url), 303);
  }
  const body = await request.json().catch(() => ({})) as {
    _action?: string;
    id?: number;
    url?: string;
    eventTypes?: unknown;
  };
  if (body._action === "clear_reveal") {
    cookieStore.delete(WEBHOOK_REVEAL_COOKIE_NAME);
    return NextResponse.json({ ok: true });
  }
  if (body._action === "test") {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const delivery = await deliverWebhookTest(session.userId, id);
    return NextResponse.json({ ok: Boolean(delivery), delivery });
  }
  if (!body.url) return NextResponse.json({ error: "url_required" }, { status: 400 });
  const webhook = await createWebhook(session.userId, body.url, body.eventTypes);
  if (!webhook) return NextResponse.json({ error: "invalid_https_url" }, { status: 400 });
  const { secret, ...row } = webhook;
  return NextResponse.json({ webhook: row, secret }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  return NextResponse.json({ ok: await deleteWebhook(session.userId, id) });
}
