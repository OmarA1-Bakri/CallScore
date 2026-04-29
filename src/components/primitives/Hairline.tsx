import type { ReactElement } from "react";

interface HairlineProps {
  readonly weight?: "soft" | "default" | "strong";
  readonly className?: string;
}

const TOKEN: Record<NonNullable<HairlineProps["weight"]>, string> = {
  soft: "border-ink-150",
  default: "border-ink-200",
  strong: "border-ink-250",
};

export default function Hairline({
  weight = "default",
  className = "",
}: HairlineProps): ReactElement {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={`border-t ${TOKEN[weight]} ${className}`}
    />
  );
}
