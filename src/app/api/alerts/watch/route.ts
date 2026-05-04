import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasAccess } from "@/lib/whop";
import { addWatch, removeWatch } from "@/lib/alerts";
import { parseCreatorId, isForeignKeyViolation } from "./helpers";

interface WatchPayload {
  readonly creatorId?: unknown;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

function upgradeRequired(): NextResponse {
  return NextResponse.json(
    { error: "upgrade_required", upgrade_url: "/pricing" },
    { status: 402, headers: { "cache-control": "no-store" } },
  );
}

function buildSettingsRedirect(
  requestUrl: string,
  status: "added" | "removed" | "error",
  queryValue: FormDataEntryValue | null,
): URL {
  const url = new URL("/settings/alerts", requestUrl);
  if (status === "error") url.searchParams.set("error", "creator_not_found");
  else url.searchParams.set(status, "1");

  if (typeof queryValue === "string") {
    const q = queryValue.trim().slice(0, 80);
    if (q) url.searchParams.set("q", q);
  }
  return url;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!hasAccess(session.tier, "pro")) {
    return upgradeRequired();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const creatorId = parseCreatorId(form.get("creatorId"));
    const q = form.get("q");
    if (creatorId === null) {
      return NextResponse.json(
        { error: "invalid_creator_id" },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    if (form.get("_action") === "remove") {
      await removeWatch(session.userId, creatorId);
      return NextResponse.redirect(
        buildSettingsRedirect(request.url, "removed", q),
        303,
      );
    }

    try {
      await addWatch(session.userId, creatorId);
      return NextResponse.redirect(
        buildSettingsRedirect(request.url, "added", q),
        303,
      );
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        return NextResponse.redirect(
          buildSettingsRedirect(request.url, "error", q),
          303,
        );
      }
      throw error;
    }
  }

  let body: WatchPayload = {};
  try {
    body = (await request.json()) as WatchPayload;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const creatorId = parseCreatorId(body.creatorId);
  if (creatorId === null) {
    return NextResponse.json(
      { error: "invalid_creator_id" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const watch = await addWatch(session.userId, creatorId);
    return NextResponse.json(
      { success: true, watch },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    if (isForeignKeyViolation(error)) {
      return NextResponse.json(
        { error: "creator_not_found" },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    const message =
      error instanceof Error ? error.message : "internal_error";
    console.error("[alerts.watch.POST]", message);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return unauthorized();

  if (!hasAccess(session.tier, "pro")) {
    return upgradeRequired();
  }

  const url = new URL(request.url);
  const creatorId = parseCreatorId(url.searchParams.get("creatorId"));
  if (creatorId === null) {
    return NextResponse.json(
      { error: "invalid_creator_id" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    await removeWatch(session.userId, creatorId);
    return NextResponse.json(
      { success: true },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "internal_error";
    console.error("[alerts.watch.DELETE]", message);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
