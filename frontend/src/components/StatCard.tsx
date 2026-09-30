import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  navy: "bg-[#0B192C]/10 text-[#0B192C]",
} as const;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  testid,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TONES;
  testid?: string;
}) {
  return (
    <Card size="sm" data-testid={testid}>
      <CardContent className="flex items-start gap-3 py-4">
        <div className={cn("rounded-lg p-2", TONES[tone])} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="font-heading text-2xl font-bold tracking-tight text-card-foreground" data-testid={testid ? `${testid}-value` : undefined}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
