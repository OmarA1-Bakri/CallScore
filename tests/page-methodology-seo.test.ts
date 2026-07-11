import assert from "node:assert/strict";
import test from "node:test";
import { METHODOLOGY_FAQS, methodologyFaqJsonLd } from "../src/app/methodology/methodology-faq";

const expectedQuestions = [
  "What counts as a scored call?",
  "When is a call mature enough to score?",
  "Why can a creator be tracked but not officially ranked?",
  "How can a score be audited?",
] as const;

test("methodology FAQ exposes the four audit questions", () => {
  assert.deepEqual(METHODOLOGY_FAQS.map((item) => item.question), expectedQuestions);
  for (const item of METHODOLOGY_FAQS) {
    assert.ok(item.answer.length >= 80, `${item.question} should have a substantive answer`);
  }
});

test("methodology FAQ JSON-LD is generated from the visible FAQ data", () => {
  assert.equal(methodologyFaqJsonLd["@context"], "https://schema.org");
  assert.equal(methodologyFaqJsonLd["@type"], "FAQPage");
  assert.deepEqual(
    methodologyFaqJsonLd.mainEntity,
    METHODOLOGY_FAQS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  );
});
