import Image from "next/image";
import type { ReactElement } from "react";

interface CallScoreBrandProps {
  readonly compact?: boolean;
}

export default function CallScoreBrand({
  compact = false,
}: CallScoreBrandProps): ReactElement {
  const markSize = compact
    ? "h-[44px] w-[44px]"
    : "h-[48px] w-[48px] tab:h-[56px] tab:w-[56px]";

  return (
    <Image
      src="/brand/callscore-exact-transparent.svg"
      alt="CallScore - Market calls, measured."
      width={56}
      height={56}
      className={`${markSize} object-contain`}
      unoptimized
      priority={!compact}
    />
  );
}
