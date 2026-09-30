import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import type { Admin, FraudFlag } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { can } from "@/lib/permissions";
import { useAuthMe } from "@/hooks/useAuthMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

const RISK_STYLES: Record<string, string> = {
  LOW: "border-slate-200 bg-slate-50 text-slate-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  HIGH: "border-red-200 bg-red-50 text-red-800",
  CRITICAL: "border-red-300 bg-red-100 text-red-900",
};

export default function FraudMonitor() {
  const { data: auth } = useAuthMe();
  const role = (auth?.user as Admin | undefined)?.role;
  const q = useQuery({
    queryKey: ["admin", "fraud-flags"],
    queryFn: () => apiGet<{ total: number; items: FraudFlag[] }>("/security/fraud-flags"),
    retry: false,
    refetchInterval: 30_000,
  });

  const review = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiPost(`/security/fraud-flags/${vars.id}/review`, { status: vars.status, note: "Reviewed from fraud monitor" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "fraud-flags"] });
      toast.success("Flag reviewed");
    },
    onError: () => toast.error("The review could not be saved."),
  });

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError) return <EmptyState icon={ShieldAlert} title="Fraud monitor unavailable" description="Risk data could not be loaded." testid="fraud-monitor-error" />;

  const flags = q.data?.items ?? [];

  return (
    <div data-testid="fraud-monitor-page">
      <PageHeader
        title="Fraud & Risk Monitor"
        description="Risk signals are escalated to FLAG_FOR_REVIEW — a score alone never accuses a voter. A Security Officer investigates each flag."
        testid="fraud-monitor-header"
      />

      {flags.length === 0 && (
        <EmptyState icon={ShieldAlert} title="No open flags" description="No suspicious patterns are currently awaiting review." testid="fraud-monitor-empty" />
      )}

      <div className="flex flex-col gap-3">
        {flags.map((f) => (
          <Card key={f.id} data-testid={`fraud-flag-${f.id}`}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${RISK_STYLES[f.risk_level] ?? RISK_STYLES.LOW}`} data-testid={`fraud-flag-risk-${f.id}`}>
                    {f.risk_level}
                  </span>
                  <StatusBadge status={f.status} testid={`fraud-flag-status-${f.id}`} />
                  <span className="text-xs text-slate-500">{f.event_type.replace(/_/g, " ")}</span>
                </div>
                <p className="mt-2 font-semibold text-slate-900">{f.reason}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Subject: <span className="font-mono">{f.subject_id}</span> ({f.subject_type}) · {f.occurrences} occurrence(s) · first seen {fmtDateTime(f.created_at)}
                </p>
                {f.review_note && <p className="mt-1 text-xs text-slate-600">Note: {f.review_note}</p>}
              </div>
              {f.status === "FLAG_FOR_REVIEW" && can(role, "fraud:review") && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => review.mutate({ id: f.id, status: "DISMISSED" })} data-testid={`fraud-flag-dismiss-${f.id}`}>
                    Dismiss
                  </Button>
                  <Button size="sm" onClick={() => review.mutate({ id: f.id, status: "ACTION_TAKEN" })} data-testid={`fraud-flag-action-${f.id}`}>
                    Mark action taken
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
