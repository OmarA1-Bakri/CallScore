import { NextRequest, NextResponse } from "next/server";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";
import { requireSessionAccess } from "@/lib/premium";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ keys: await listApiKeys(session.userId) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (form.get("_action") === "revoke") {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "invalid_id" }, { status: 400 });
      }
      await revokeApiKey(session.userId, id);
      return NextResponse.redirect(new URL("/settings/api", request.url), 303);
    }
    const key = await createApiKey(session.userId, String(form.get("name") ?? "Alpha API key"));
    return NextResponse.json({ key: key.row, secret: key.secret }, { status: 201 });
  }
  const body = await request.json().catch(() => ({})) as { name?: string };
  const key = await createApiKey(session.userId, body.name ?? "Alpha API key");
  return NextResponse.json({ key: key.row, secret: key.secret }, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  return NextResponse.json({ ok: await revokeApiKey(session.userId, id) });
}
