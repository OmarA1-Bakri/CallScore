import Image from "next/image";
import type { ReactElement } from "react";

interface CallScoreBrandProps {
  readonly compact?: boolean;
}

export default function CallScoreBrand({
  compact = false,
}: CallScoreBrandProps): ReactElement {
  return (
    <Image
      src="/brand/callscore-exact-transparent.svg"
      alt="CallScore - Market calls, measured."
      width={2000}
      height={2000}
      className={
        compact
          ? "h-[82px] w-[82px] object-contain"
          : "h-[76px] w-[76px] object-contain tab:h-[88px] tab:w-[88px]"
      }
      unoptimized
      priority={!compact}
    />
  );
}
