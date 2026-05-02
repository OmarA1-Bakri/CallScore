import type { ReactElement } from "react";

interface CallScoreBrandProps {
  readonly compact?: boolean;
}

export default function CallScoreBrand({
  compact = false,
}: CallScoreBrandProps): ReactElement {
  const markSize = compact ? "h-[64px] w-[64px]" : "h-[60px] w-[60px] tab:h-[70px] tab:w-[70px]";
  const labelSize = compact ? "text-[12px]" : "text-[12px] tab:text-[13px]";

  return (
    <span
      className={`relative inline-grid ${markSize} place-items-center border border-accent/30 bg-ink-50 text-accent shadow-[inset_0_1px_0_rgba(201,162,75,0.18)]`}
      style={{ borderRadius: 999 }}
      aria-label="CallScore - Market calls, measured."
      role="img"
    >
      <span className={`font-serif ${labelSize} italic leading-none text-accent`}>
        Call
        <br />
        Score
      </span>
      <span
        className="absolute h-[1px] w-[68%] rotate-[-42deg] bg-accent"
        aria-hidden="true"
      />
      <span
        className="absolute bottom-[18%] right-[18%] h-2 w-2 bg-accent"
        style={{ borderRadius: 999 }}
        aria-hidden="true"
      />
    </span>
  );
}
