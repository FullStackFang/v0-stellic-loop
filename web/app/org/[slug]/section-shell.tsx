import type { ReactNode } from "react";

/** Same raised card and heading as the dashboard's own sections. */
export function SectionShell({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="pls-raised flex flex-col gap-4 p-6">
      <h2 className="pls-display text-2xl font-bold leading-tight">
        {title}
        {count !== undefined ? <span className="pls-mono text-tertiary"> · {count}</span> : null}
      </h2>
      {children}
    </section>
  );
}
