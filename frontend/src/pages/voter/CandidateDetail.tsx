import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserRound } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Candidate } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function CandidateDetail() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["voter", "candidate", id],
    queryFn: () => apiGet<Candidate>(`/candidates/${id}`),
    retry: false,
  });

  if (q.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (q.isError || !q.data) {
    return (
      <EmptyState
        icon={UserRound}
        title="Candidate not found"
        description="This candidate profile is unavailable or has been deactivated."
        testid="candidate-detail-error"
      />
    );
  }

  const c = q.data;
  return (
    <div data-testid="candidate-detail-page">
      <PageHeader title={c.name} description={c.party} testid="candidate-detail-header" />
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#0B192C] font-mono text-lg font-bold text-white" data-testid="candidate-detail-symbol">
              {c.symbol}
            </div>
            <div>
              <p className="font-heading text-xl font-bold" data-testid="candidate-detail-name">{c.name}</p>
              <p className="text-sm text-slate-600" data-testid="candidate-detail-party">{c.party}</p>
              <div className="mt-2"><StatusBadge status={c.status} testid="candidate-detail-status" /></div>
            </div>
          </div>
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Manifesto & biography</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700" data-testid="candidate-detail-description">
              {c.description || "No biography has been published for this candidate."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
