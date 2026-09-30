import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  testid,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center"
    >
      <div className="rounded-full bg-muted p-3 text-muted-foreground" aria-hidden="true">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-heading text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
