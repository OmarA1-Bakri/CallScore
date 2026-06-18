import { NextResponse } from "next/server";
import { buildControlPlaneOverview, controlPlane } from "../../../lib/control-plane";
import { fetchHhReadJson } from "../../../lib/hh-read-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(limit));
  const hhPayload = await fetchHhReadJson<Record<string, unknown>>("/workflows", { searchParams, revalidate: 0 });
  if (hhPayload?.ok === true) return NextResponse.json(hhPayload);
  const overview = await buildControlPlaneOverview(controlPlane, limit);
  return NextResponse.json({ ok: true, ...overview });
}
