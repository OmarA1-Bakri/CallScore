import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface FeedbackPayload {
  readonly name?: string;
  readonly email?: string;
  readonly category: string;
  readonly issueType?: string;
  readonly contextUrl?: string;
  readonly sourceUrl?: string;
  readonly message: string;
}

const FEEDBACK_CATEGORIES = [
  "Scoring Evidence",
  "Creator Data",
  "Call Source",
  "Product Issue",
  "Billing / Refund",
] as const;
const VALID_CATEGORIES = new Set<string>(FEEDBACK_CATEGORIES);
const CATEGORY_ALIASES = new Map<string, string>([
  ["Scoring Methodology", "Scoring Evidence"],
  ["Creator Suggestion", "Creator Data"],
  ["Feature Request", "Product Issue"],
  ["Bug Report", "Product Issue"],
  ["Other", "Product Issue"],
  ["Billing Access", "Billing / Refund"],
]);

function normalizeCategory(value: string): string | null {
  if (VALID_CATEGORIES.has(value)) return value;
  return CATEGORY_ALIASES.get(value) ?? null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function composePersistedMessage(feedback: FeedbackPayload): string {
  const rows = [
    feedback.issueType ? `Issue type: ${feedback.issueType}` : null,
    feedback.contextUrl ? `Context URL: ${feedback.contextUrl}` : null,
    feedback.sourceUrl ? `Evidence URL: ${feedback.sourceUrl}` : null,
    "",
    "Evidence:",
    feedback.message.trim(),
  ].filter((row): row is string => row !== null);

  return rows.join("\n");
}

function isValidPayload(body: unknown): body is FeedbackPayload {
  if (typeof body !== "object" || body === null) return false;

  const obj = body as Record<string, unknown>;

  if (typeof obj.message !== "string" || obj.message.trim().length === 0) {
    return false;
  }

  if (
    typeof obj.category !== "string" ||
    normalizeCategory(obj.category) === null
  ) {
    return false;
  }

  if (obj.name !== undefined && typeof obj.name !== "string") return false;
  if (obj.email !== undefined && typeof obj.email !== "string") return false;
  if (obj.issueType !== undefined && typeof obj.issueType !== "string") return false;
  if (obj.contextUrl !== undefined && typeof obj.contextUrl !== "string") return false;
  if (obj.sourceUrl !== undefined && typeof obj.sourceUrl !== "string") return false;

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
      name: normalizeOptionalString(body.name),
      email: normalizeOptionalString(body.email),
      category: normalizeCategory(body.category)!,
      issueType: normalizeOptionalString(body.issueType),
      contextUrl: normalizeOptionalString(body.contextUrl),
      sourceUrl: normalizeOptionalString(body.sourceUrl),
      message: body.message.trim(),
    };

    try {
      await query(
        `INSERT INTO feedback_reports (category, email, message)
         VALUES ($1, $2, $3)`,
        [
          feedback.category,
          feedback.email ?? null,
          composePersistedMessage(feedback),
        ],
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "feedback persistence unavailable";
      console.warn("[FEEDBACK_PERSISTENCE]", message);
    }

    console.info("[FEEDBACK]", {
      timestamp: new Date().toISOString(),
      category: feedback.category,
      issue_type: feedback.issueType ?? null,
      name_provided: Boolean(feedback.name),
      email_provided: Boolean(feedback.email),
      message_chars: feedback.message.length,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to process feedback." },
      { status: 500 },
    );
  }
}
