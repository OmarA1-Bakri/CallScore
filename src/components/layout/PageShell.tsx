import clsx from "clsx";

interface PageShellProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly as?: "main" | "div";
}

export default function PageShell({ children, className, as = "main" }: PageShellProps) {
  const Component = as;
  return (
    <Component className={clsx("page-shell", className)}>
      {children}
    </Component>
  );
}
