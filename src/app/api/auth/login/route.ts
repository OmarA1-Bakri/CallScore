import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import type { Tier } from "@/lib/types";

const FREE_PASSWORD = process.env.NON_WHOP_ACCESS_PASSWORD;
const ALPHA_PASSWORD = process.env.ALPHA_ACCESS_PASSWORD;

function resolveTier(password) {
  if (ALPHA_PASSWORD && ALPHA_PASSWORD.length >= 8 && password === ALPHA_PASSWORD) return "alpha";
  if (FREE_PASSWORD && FREE_PASSWORD.length >= 8 && password === FREE_PASSWORD) return "free";
  return null;
}

export async function POST(request) {
  if (!FREE_PASSWORD || FREE_PASSWORD.length < 8) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { username, password } = body;
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const tier = resolveTier(password);
  if (!tier) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const userId = username && username.trim().length > 0
    ? "non-whop-" + username.trim()
    : "non-whop-" + tier;

  await createSession(userId, tier, "");

  return NextResponse.json({ ok: true, tier, userId });
}

export async function GET(request) {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
