import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { captureApiException } from "@/lib/monitoring";

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

const feedbackPayloadSchema = z.object({
  name: z.string().optional(),
  email: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),
  category: z.string(),
  issueType: z.string().optional(),
  contextUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  message: z.string().trim().min(1),
});

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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = feedbackPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid feedback. Message and valid category are required." },
        { status: 400 },
      );
    }

    const { data } = parsed;
    const category = normalizeCategory(data.category);

    if (category === null) {
      return NextResponse.json(
        { success: false, error: "Invalid feedback. Message and valid category are required." },
        { status: 400 },
      );
    }

    const feedback: FeedbackPayload = {
      name: normalizeOptionalString(data.name),
      email: normalizeOptionalString(data.email),
      category,
      issueType: normalizeOptionalString(data.issueType),
      contextUrl: normalizeOptionalString(data.contextUrl),
      sourceUrl: normalizeOptionalString(data.sourceUrl),
      message: data.message,
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
      void captureApiException(error, "/api/feedback", { stage: "persist" });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    void captureApiException(error, "/api/feedback", { stage: "request" });
    return NextResponse.json(
      { success: false, error: "Failed to process feedback." },
      { status: 500 },
    );
  }
}
