import type { ReactElement, ReactNode } from "react";

export interface MetaCell {
  readonly k: string;
  readonly v: ReactNode;
}

interface MetaStripProps {
  readonly cells: readonly MetaCell[];
}

export default function MetaStrip({ cells }: MetaStripProps): ReactElement {
  return (
    <dl
      className="grid grid-cols-2 tab:grid-cols-4 gap-[18px] mt-8"
      aria-label="Section metadata"
    >
      {cells.map((cell) => (
        <div key={cell.k} className="border-t border-ink-250 pt-3.5">
          <dt className="font-mono text-[9.5px] text-ink-500 tracking-caps uppercase mb-1.5">
            {cell.k}
          </dt>
          <dd className="font-serif text-[24px] text-ink-900 font-medium tracking-tight">
            {cell.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
