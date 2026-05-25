import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";

const PASSWORD = process.env.NON_WHOP_ACCESS_PASSWORD;

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!PASSWORD || PASSWORD.length < 8) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };
  
  if (password !== PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await createSession("non-whop-user", "free", "");
  
  return NextResponse.json({ ok: true, tier: "free" });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
