import { NextResponse } from "next/server";
import { buildWorkflowRunDetail, controlPlane } from "../../../../lib/control-plane";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const detail = await buildWorkflowRunDetail(controlPlane, id);
  if (!detail) return NextResponse.json({ ok: false, error: "workflow_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...detail });
}
