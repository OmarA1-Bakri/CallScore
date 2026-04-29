"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const CATEGORIES = [
  "Scoring Methodology",
  "Creator Suggestion",
  "Feature Request",
  "Bug Report",
  "Other",
] as const;

type Category = (typeof CATEGORIES)[number];

interface FormState {
  readonly name: string;
  readonly email: string;
  readonly category: Category;
  readonly message: string;
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  category: "Scoring Methodology",
  message: "",
};

export default function FeedbackPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (!form.message.trim()) {
      setErrorMessage("Please enter a message before submitting.");
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
          name: form.name.trim() || undefined,
          email: form.email.trim() || undefined,
          category: form.category,
          message: form.message.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Submission failed (${res.status})`,
        );
      }

      setStatus("success");
      setForm(INITIAL_FORM);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong.";
      setErrorMessage(msg);
      setStatus("error");
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-ink-500 hover:text-ink-700 text-sm mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leaderboard
      </Link>

      {/* Hero */}
      <section className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 px-4 py-1.5 mb-6">
          <span className="text-accent text-xs font-medium">
            Your Voice Matters
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-ink-900 mb-4 leading-tight">
          Help Us{" "}
          <span className="text-gradient-gold">Improve the Rankings</span>
        </h1>

        <p className="text-ink-600 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
          We value your input. Share feedback on how we rank creators, what
          criteria you&apos;d like to see, or if you have suggestions to improve
          accuracy. Your voice shapes this platform, and we&apos;re always
          listening to refine our rankings.
        </p>
      </section>

      {/* Form */}
      <section className="max-w-xl mx-auto mb-16">
        {status === "success" ? (
          <div className="border border-ink-200 p-8 text-center">
            <p
              aria-hidden="true"
              className="text-pos text-3xl font-bold mb-4"
            >
              ✓
            </p>
            <h2 className="text-ink-900 font-bold text-xl mb-2">
              Thank You for Your Feedback
            </h2>
            <p className="text-ink-600 text-sm mb-6">
              We appreciate you taking the time to share your thoughts. Your
              feedback helps us build a better platform for everyone.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="bg-ink-100 hover:bg-ink-150 text-ink-900 border border-ink-200 font-semibold text-sm px-6 py-2.5 transition-colors"
            >
              Send More Feedback
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="border border-ink-200 p-6 sm:p-8 space-y-5"
          >
            {/* Name */}
            <div>
              <label
                htmlFor="feedback-name"
                className="block text-ink-700 text-sm font-medium mb-1.5"
              >
                Name{" "}
                <span className="text-ink-400 font-normal">(optional)</span>
              </label>
              <input
                id="feedback-name"
                type="text"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full bg-ink-0 border border-ink-200 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="feedback-email"
                className="block text-ink-700 text-sm font-medium mb-1.5"
              >
                Email{" "}
                <span className="text-ink-400 font-normal">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="w-full bg-ink-0 border border-ink-200 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor="feedback-category"
                className="block text-ink-700 text-sm font-medium mb-1.5"
              >
                Category
              </label>
              <select
                id="feedback-category"
                value={form.category}
                onChange={(e) =>
                  updateField("category", e.target.value as Category)
                }
                className="w-full bg-ink-0 border border-ink-200 px-4 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors appearance-none cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="feedback-message"
                className="block text-ink-700 text-sm font-medium mb-1.5"
              >
                Message <span className="text-neg">*</span>
              </label>
              <textarea
                id="feedback-message"
                rows={5}
                placeholder="Tell us what you think..."
                value={form.message}
                onChange={(e) => updateField("message", e.target.value)}
                required
                className="w-full bg-ink-0 border border-ink-200 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-vertical min-h-[120px]"
              />
            </div>

            {/* Error */}
            {status === "error" && errorMessage && (
              <div className="flex items-start gap-2 bg-neg/10 border border-neg/20 px-4 py-3">
                <span aria-hidden="true" className="text-neg font-bold">
                  !
                </span>
                <p className="text-neg text-sm">{errorMessage}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-dim text-ink-0 font-semibold text-sm px-6 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? "Sending..." : "Send Feedback"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
