import type { ReactNode } from "react";

export function ContentShell({
  title,
  lede,
  children,
  testid,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  testid?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12" data-testid={testid}>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Smart E-Election System
      </p>
      <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{lede}</p>
      <div className="mt-10 flex flex-col gap-6">{children}</div>
    </div>
  );
}

export function ContentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6" data-testid={`section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <h2 className="font-heading text-xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export function ContentList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
