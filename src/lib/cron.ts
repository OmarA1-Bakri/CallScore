import { NextRequest, NextResponse } from "next/server";

export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  return authHeader.slice(7) === cronSecret;
}

export function cronUnauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
