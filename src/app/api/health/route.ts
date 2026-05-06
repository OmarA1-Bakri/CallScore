import { NextResponse } from "next/server";
import { buildHealthResponse } from "./helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return buildHealthResponse();
}
