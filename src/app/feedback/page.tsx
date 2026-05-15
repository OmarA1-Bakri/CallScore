"use client";

import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

const CATEGORIES = [
  "Scoring Evidence",
  "Creator Data",
  "Call Source",
  "Product Issue",
  "Billing / Refund",
] as const;

const ISSUE_TYPES = [
  "Incorrect data",
  "Missing source",
  "Broken page",
  "Feature gap",
  "Billing or refund",
] as const;

type Category = (typeof CATEGORIES)[number];
type IssueType = (typeof ISSUE_TYPES)[number];

interface FormState {
  readonly email: string;
  readonly category: Category;
  readonly issueType: IssueType;
  readonly contextUrl: string;
  readonly sourceUrl: string;
  readonly evidence: string;
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const INITIAL_FORM: FormState = {
  email: "",
  category: "Scoring Evidence",
  issueType: "Incorrect data",
  contextUrl: "",
  sourceUrl: "",
  evidence: "",
};

function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  readonly htmlFor: string;
  readonly children: string;
  readonly optional?: boolean;
}): ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block font-mono text-mono-sm uppercase tracking-caps text-ink-500"
    >
      {children}
      {optional && <span className="text-ink-600"> / optional</span>}
    </label>
  );
}

function composeEvidence(form: FormState): string {
  return form.evidence.trim();
}

function normalizeContextHint(value: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (trimmed === "current-page") {
    if (typeof document !== "undefined" && document.referrer) {
      return document.referrer;
    }
    return "";
  }

  if (trimmed.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${trimmed}`;
  }

  return trimmed;
}

export default function FeedbackPage(): ReactElement {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hint = normalizeContextHint(searchParams.get("context"));
    if (!hint) return;
    setForm((prev) => (prev.contextUrl ? prev : { ...prev, contextUrl: hint }));
  }, []);

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    if (!form.evidence.trim()) {
      setErrorMessage("Add the evidence or correction before sending.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim() || undefined,
          category: form.category,
          issueType: form.issueType,
          contextUrl: form.contextUrl.trim() || undefined,
          sourceUrl: form.sourceUrl.trim() || undefined,
          message: composeEvidence(form),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { readonly error?: string }
          | null;
        throw new Error(data?.error ?? `Submission failed (${res.status})`);
      }

      setStatus("success");
      setForm(INITIAL_FORM);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Submission failed.",
      );
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-page px-[14px] py-8 tab:px-6 tab:py-10 desk:px-8 desk:py-14">
      <Link
        href="/"
        className="mb-8 inline-flex font-mono text-mono-sm uppercase tracking-caps text-ink-500 transition-colors hover:text-accent"
      >
        &larr; Back to leaderboard
      </Link>

      <section className="grid gap-8 border-y border-ink-250 py-8 desk:grid-cols-[0.86fr_1.14fr] desk:gap-12">
        <div>
          <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-accent">
            <span aria-hidden="true" className="inline-block h-2 w-2 bg-accent" />
            Evidence intake
          </p>
          <h1 className="mt-3 max-w-[720px] font-serif text-h1 text-ink-900">
            Report a data issue, source gap, or product defect.
          </h1>
          <p className="mt-4 max-w-[620px] font-serif text-[18px] leading-relaxed text-ink-700">
            The useful report is the one that includes the exact creator, call,
            page URL, source link, or screenshot needed to verify the issue.
          </p>
          <p className="mt-3 max-w-[620px] text-body text-ink-600">
            Billing and refund reports go through this same form. Include the
            order email, charge date, amount, and the exact issue to investigate.
          </p>

          <div className="mt-8 grid border border-ink-250 bg-ink-50 font-mono text-[11px] uppercase tracking-caps text-ink-500 tab:grid-cols-3">
            <div className="border-b border-ink-200 p-3 tab:border-b-0 tab:border-r">
              <span className="block text-ink-800">01</span>
              category
            </div>
            <div className="border-b border-ink-200 p-3 tab:border-b-0 tab:border-r">
              <span className="block text-ink-800">02</span>
              context
            </div>
            <div className="p-3">
              <span className="block text-ink-800">03</span>
              evidence
            </div>
          </div>
        </div>

        <div className="border border-ink-250 bg-ink-50 p-4 tab:p-5">
          {status === "success" ? (
            <div className="border border-pos/40 bg-ink-0 p-5">
              <p className="flex items-center gap-2 font-mono text-mono-sm uppercase tracking-caps text-pos">
                <span aria-hidden="true" className="inline-block h-2 w-2 bg-pos" />
                evidence logged
              </p>
              <h2 className="mt-3 font-serif text-h3 text-ink-900">
                Evidence logged.
              </h2>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="mt-5 min-h-11 border border-ink-300 px-4 font-mono text-mono-sm uppercase tracking-caps text-ink-800 transition-colors hover:border-accent hover:text-accent"
              >
                Send another report
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 tab:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="feedback-category">Category</FieldLabel>
                  <select
                    id="feedback-category"
                    value={form.category}
                    onChange={(event) =>
                      updateField("category", event.target.value as Category)
                    }
                    className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 focus:border-accent focus:outline-none"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <FieldLabel htmlFor="feedback-issue-type">Issue type</FieldLabel>
                  <select
                    id="feedback-issue-type"
                    value={form.issueType}
                    onChange={(event) =>
                      updateField("issueType", event.target.value as IssueType)
                    }
                    className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 focus:border-accent focus:outline-none"
                  >
                    {ISSUE_TYPES.map((issueType) => (
                      <option key={issueType} value={issueType}>
                        {issueType}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="feedback-context" optional>
                  Page URL / context
                </FieldLabel>
                <input
                  id="feedback-context"
                  type="text"
                  value={form.contextUrl}
                  onChange={(event) =>
                    updateField("contextUrl", event.target.value)
                  }
                  placeholder="https://www.call-score.com/creator/... or pasted page context"
                  className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <FieldLabel htmlFor="feedback-source" optional>
                  Screenshot / source link
                </FieldLabel>
                <input
                  id="feedback-source"
                  type="url"
                  value={form.sourceUrl}
                  onChange={(event) => updateField("sourceUrl", event.target.value)}
                  placeholder="https://youtube.com/... or image link"
                  className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <FieldLabel htmlFor="feedback-email" optional>
                  Contact email
                </FieldLabel>
                <input
                  id="feedback-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="you@example.com"
                  className="min-h-11 w-full border border-ink-250 bg-ink-0 px-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <FieldLabel htmlFor="feedback-evidence">Evidence</FieldLabel>
                <textarea
                  id="feedback-evidence"
                  rows={7}
                  value={form.evidence}
                  onChange={(event) => updateField("evidence", event.target.value)}
                  required
                  placeholder="Creator, call, timestamp, expected value, observed value. For billing/refund: include charge email, amount, date, and requested resolution."
                  className="min-h-[170px] w-full resize-y border border-ink-250 bg-ink-0 px-3 py-3 font-mono text-body text-ink-800 placeholder:text-ink-500 focus:border-accent focus:outline-none"
                />
              </div>

              {status === "error" && errorMessage && (
                <div className="border border-neg/40 bg-neg/10 p-3 font-mono text-[12px] text-neg">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="min-h-11 bg-accent px-4 font-mono text-mono-lg font-semibold uppercase tracking-caps text-ink-0 transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? "Logging" : "Log evidence"}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
