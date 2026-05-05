import Image from "next/image";
import type { ReactElement } from "react";

interface CallScoreBrandProps {
  readonly compact?: boolean;
  readonly showTagline?: boolean;
  readonly className?: string;
}

export default function CallScoreBrand({
  compact = false,
  showTagline = false,
  className = "",
}: CallScoreBrandProps): ReactElement {
  const lockupSize = compact
    ? "h-[34px] w-[150px]"
    : showTagline
      ? "h-[88px] w-[330px] tab:h-[96px] tab:w-[390px]"
      : "h-[42px] w-[185px]";

  return (
    <Image
      src="/brand/callscore-lockup-transparent.png"
      alt="CallScore - Track calls. Score outcomes. Find alpha."
      width={1149}
      height={466}
      className={`${lockupSize} object-contain object-left ${className}`}
      unoptimized
      priority={!compact}
    />
  );
}
