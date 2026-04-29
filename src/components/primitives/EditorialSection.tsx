import type { ReactElement, ReactNode } from "react";

interface EditorialSectionProps {
  readonly index: string;          // "01", "02"
  readonly title: ReactNode;       // can include <em> via JSX
  readonly meta?: ReactNode;       // right-rail mono caption
  readonly children: ReactNode;
  readonly first?: boolean;        // suppress top border
}

export default function EditorialSection({
  index,
  title,
  meta,
  children,
  first = false,
}: EditorialSectionProps): ReactElement {
  return (
    <section className={`py-12 ${first ? "" : "border-t border-ink-250"}`}>
      <header className="grid grid-cols-1 desk:grid-cols-[96px_1fr_280px] gap-8 items-baseline mb-8">
        <div className="font-mono text-[11px] text-ink-500 tracking-caps uppercase">{index}</div>
        <h2 className="font-serif text-[28px] desk:text-[32px] text-ink-900 font-medium tracking-tight leading-snug text-balance">
          {title}
        </h2>
        {meta && (
          <div className="font-mono text-[10px] text-ink-500 tracking-wide leading-relaxed desk:text-right">
            {meta}
          </div>
        )}
      </header>
      <div className="desk:ml-[128px] max-w-[820px]">{children}</div>
    </section>
  );
}
