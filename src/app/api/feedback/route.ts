import { NextResponse } from "next/server";

interface FeedbackPayload {
  readonly name?: string;
  readonly email?: string;
  readonly category: string;
  readonly message: string;
}

const VALID_CATEGORIES = new Set([
  "Scoring Methodology",
  "Creator Suggestion",
  "Feature Request",
  "Bug Report",
  "Other",
]);

function isValidPayload(body: unknown): body is FeedbackPayload {
  if (typeof body !== "object" || body === null) return false;

  const obj = body as Record<string, unknown>;

  if (typeof obj.message !== "string" || obj.message.trim().length === 0) {
    return false;
  }

  if (typeof obj.category !== "string" || !VALID_CATEGORIES.has(obj.category)) {
    return false;
  }

  if (obj.name !== undefined && typeof obj.name !== "string") return false;
  if (obj.email !== undefined && typeof obj.email !== "string") return false;

  return true;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    if (!isValidPayload(body)) {
      return NextResponse.json(
        { success: false, error: "Invalid feedback. Message and valid category are required." },
        { status: 400 },
      );
    }

    const feedback: FeedbackPayload = {
      name: body.name,
      email: body.email,
      category: body.category,
      message: body.message,
    };

    // Log feedback to server console for now.
    // TODO: Persist to database or forward via email in a future iteration.
    console.info("[FEEDBACK]", {
      timestamp: new Date().toISOString(),
      category: feedback.category,
      name_provided: Boolean(feedback.name?.trim()),
      email_provided: Boolean(feedback.email?.trim()),
      message_chars: feedback.message.trim().length,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to process feedback." },
      { status: 500 },
    );
  }
}
