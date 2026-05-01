import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feedback — CallScore",
  description:
    "Share your feedback on CallScore. Suggest creators, report issues, or request features.",
  alternates: { canonical: "/feedback" },
};

interface FeedbackLayoutProps {
  readonly children: React.ReactNode;
}

export default function FeedbackLayout({ children }: FeedbackLayoutProps) {
  return children;
}
