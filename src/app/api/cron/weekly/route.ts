import { NextRequest, NextResponse } from "next/server";
import { runWeeklyCron } from "./helpers";

export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWeeklyCron(request);
}
