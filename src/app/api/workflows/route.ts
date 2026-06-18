import { NextResponse } from "next/server";
import { buildControlPlaneOverview, controlPlane } from "../../../lib/control-plane";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const overview = await buildControlPlaneOverview(controlPlane, limit);
  return NextResponse.json({ ok: true, ...overview });
}
