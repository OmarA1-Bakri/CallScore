import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  API_KEY_REVEAL_COOKIE_NAME,
  createApiKey,
  createApiKeyRevealCookieValue,
  listApiKeys,
  revokeApiKey,
} from "@/lib/api-keys";
import { noStoreHeaders, withNoStore } from "@/lib/http-cache";
import { requireSessionAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  return NextResponse.json(
    { keys: await listApiKeys(session.userId) },
    { headers: noStoreHeaders() },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const cookieStore = await cookies();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (form.get("_action") === "clear_reveal") {
      cookieStore.delete(API_KEY_REVEAL_COOKIE_NAME);
      return withNoStore(NextResponse.redirect(new URL("/settings/api", request.url), 303));
    }
    if (form.get("_action") === "revoke") {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "invalid_id" }, { status: 400, headers: noStoreHeaders() });
      }
      await revokeApiKey(session.userId, id);
      return withNoStore(NextResponse.redirect(new URL("/settings/api?revoked=1", request.url), 303));
    }
    const created = await createApiKey(
      session.userId,
      String(form.get("name") ?? "Alpha API key"),
    );
    cookieStore.set(
      API_KEY_REVEAL_COOKIE_NAME,
      createApiKeyRevealCookieValue({
        name: created.row.name,
        prefix: created.row.prefix,
        secret: created.secret,
      }),
      revealCookieOptions(),
    );
    return withNoStore(NextResponse.redirect(new URL("/settings/api?created=1", request.url), 303));
  }
  const body = (await request.json().catch(() => ({}))) as {
    _action?: string;
    name?: string;
  };
  if (body._action === "clear_reveal") {
    cookieStore.delete(API_KEY_REVEAL_COOKIE_NAME);
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  }
  const key = await createApiKey(session.userId, body.name ?? "Alpha API key");
  return NextResponse.json(
    { key: key.row, secret: key.secret },
    { status: 201, headers: noStoreHeaders() },
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await requireSessionAccess("alpha");
  if (session instanceof NextResponse) return session;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400, headers: noStoreHeaders() });
  }
  return NextResponse.json(
    { ok: await revokeApiKey(session.userId, id) },
    { headers: noStoreHeaders() },
  );
}
