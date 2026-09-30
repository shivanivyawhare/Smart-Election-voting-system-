import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusTone } from "@/lib/format";

const TONES: Record<string, string> = {
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-50",
  pending: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50",
  active: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-50",
  failed: "bg-red-50 text-red-800 border-red-200 hover:bg-red-50",
  warning: "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-50",
  neutral: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100",
};

export function StatusBadge({
  status,
  testid,
  className,
}: {
  status: string;
  testid?: string;
  className?: string;
}) {
  const tone = TONES[statusTone(status)] ?? TONES.neutral;
  return (
    <Badge
      variant="outline"
      data-testid={testid ?? `status-badge-${status.toLowerCase().replace(/_/g, "-")}`}
      className={cn("border font-semibold", tone, className)}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
