import { NextResponse } from "next/server";
import { buildEntityLineage, controlPlane } from "../../../../../lib/control-plane";
import { fetchHhReadJson } from "../../../../../lib/hh-read-api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const hhPayload = await fetchHhReadJson<Record<string, unknown>>(`/calls/${encodeURIComponent(id)}/lineage`, { revalidate: 0 });
  if (hhPayload?.ok === true) return NextResponse.json(hhPayload);
  const artifacts = await buildEntityLineage(controlPlane, "market_call", id);
  return NextResponse.json({ ok: true, entityType: "market_call", entityId: id, artifacts });
}
