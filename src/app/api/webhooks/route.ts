import { NextRequest, NextResponse } from "next/server";
import { createWebhook, deleteWebhook, listWebhooks } from "@/lib/webhooks";
import { requireSessionAccess } from "@/lib/premium";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ webhooks: await listWebhooks(session.userId) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (form.get("_action") === "delete") {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "invalid_id" }, { status: 400 });
      }
      await deleteWebhook(session.userId, id);
      return NextResponse.redirect(new URL("/settings/webhooks", request.url), 303);
    }
    const webhook = await createWebhook(session.userId, String(form.get("url") ?? ""), form.getAll("eventTypes"));
    if (!webhook) return NextResponse.json({ error: "invalid_https_url" }, { status: 400 });
    return NextResponse.redirect(new URL("/settings/webhooks", request.url), 303);
  }
  const body = await request.json().catch(() => ({})) as {
    url?: string;
    eventTypes?: unknown;
  };
  if (!body.url) return NextResponse.json({ error: "url_required" }, { status: 400 });
  const webhook = await createWebhook(session.userId, body.url, body.eventTypes);
  if (!webhook) return NextResponse.json({ error: "invalid_https_url" }, { status: 400 });
  return NextResponse.json({ webhook }, { status: 201 });
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
