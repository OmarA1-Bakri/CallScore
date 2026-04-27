import clsx from "clsx";

export type Direction = "long" | "short" | "neutral";

export interface DirChipProps {
  readonly direction: Direction;
}

export default function DirChip({ direction }: DirChipProps) {
  const glyph = direction === "long" ? "▲" : direction === "short" ? "▼" : "·";
  return <span className={clsx("dir-chip", `dir-${direction}`)}>{glyph} {direction}</span>;
}
