import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRecentAlertsForUser, listWatches } from "@/lib/alerts";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const [watches, recentAlerts] = await Promise.all([
      listWatches(session.userId),
      listRecentAlertsForUser(session.userId, 20),
    ]);
    return NextResponse.json(
      { watches, recentAlerts },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "internal_error";
    console.error("[alerts.list.GET]", message);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
