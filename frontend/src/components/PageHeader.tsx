import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  testid,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
