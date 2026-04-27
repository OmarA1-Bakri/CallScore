import Link from "next/link";
import clsx from "clsx";

export interface ProvenanceProps {
  readonly href: string;
  readonly label?: string;
  readonly verified?: boolean;
  readonly locked?: boolean;
}

export default function Provenance({ href, label = "source", verified = true, locked = false }: ProvenanceProps) {
  const content = (
    <>
      <span className={clsx("prov-square", verified && "prov-verified")} aria-hidden="true" />
      <span>{locked ? "locked source" : label}</span>
    </>
  );

  if (locked) {
    return <span className="provenance provenance-locked">{content}</span>;
  }

  return (
    <Link href={href} className="provenance">
      {content}
    </Link>
  );
}
