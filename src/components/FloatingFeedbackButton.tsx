import Link from "next/link";

export default function FloatingFeedbackButton() {
  return (
    <Link href="/feedback" aria-label="Give feedback" className="feedback-tab">
      Feedback
    </Link>
  );
}
