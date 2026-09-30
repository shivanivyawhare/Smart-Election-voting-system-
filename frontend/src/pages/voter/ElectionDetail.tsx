import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Users, Vote } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { VoterElectionDetail } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export default function VoterElectionDetailPage() {
  const { id = "" } = useParams();
  const detailQ = useQuery({
    queryKey: ["voter", "election", id],
    queryFn: () => apiGet<VoterElectionDetail>(`/elections/${id}`),
    retry: false,
  });

  if (detailQ.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (detailQ.isError || !detailQ.data) {
    return (
      <EmptyState
        icon={Vote}
        title="Election unavailable"
        description="This election could not be loaded. It may not exist, or the service is temporarily unreachable."
        testid="voter-election-detail-error"
      />
    );
  }

  const e = detailQ.data;
  const myCandidates = e.voter_constituency
    ? e.candidates.filter((c) => c.constituency_id === e.voter_constituency!.id)
    : e.candidates;

  return (
    <div data-testid="voter-election-detail-page">
      <PageHeader
        title={e.name}
        description={e.description}
        testid="voter-election-detail-header"
        actions={
          e.eligibility?.allowed ? (
            <Link to={`/voter/ballot/${e.id}`} className={cn(buttonVariants())} data-testid="election-detail-vote-button">
              Cast your vote <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</p>
            <div className="mt-2"><StatusBadge status={e.status} testid="election-detail-status" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voting window</p>
            <p className="mt-2 text-sm text-slate-700">{fmtDateTime(e.start_at)}</p>
            <p className="text-sm text-slate-700">→ {fmtDateTime(e.end_at)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your constituency</p>
            <p className="mt-2 text-sm font-semibold text-slate-900" data-testid="election-detail-constituency">
              {e.voter_constituency ? `${e.voter_constituency.name} (${e.voter_constituency.code})` : "Not assigned"}
            </p>
          </CardContent>
        </Card>
      </div>

      {e.eligibility && (
        <Card className="mb-6" data-testid="election-detail-eligibility">
          <CardHeader><CardTitle className="font-heading text-base">Eligibility</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-sm font-semibold ${e.eligibility.allowed ? "text-emerald-800" : "text-amber-800"}`} data-testid="election-detail-eligibility-message">
              {e.eligibility.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {e.eligibility.checks.map((c) => (
                <span
                  key={c.code}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                >
                  {c.passed ? "✓" : "✗"} {c.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="font-heading text-lg">
            Candidates {e.voter_constituency ? `— ${e.voter_constituency.name}` : ""}
          </CardTitle>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> {myCandidates.length}
          </span>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {myCandidates.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-4" data-testid={`election-detail-candidate-${c.id}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0B192C] font-mono text-xs font-bold text-white">
                  {c.symbol}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">{c.party}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{c.description}</p>
              <Link to={`/voter/candidates/${c.id}`} className="mt-3 inline-block text-xs font-semibold text-[#1D4ED8] hover:underline" data-testid={`election-detail-candidate-link-${c.id}`}>
                Full profile →
              </Link>
            </div>
          ))}
          {myCandidates.length === 0 && (
            <div className="sm:col-span-2">
              <EmptyState icon={Users} title="No candidates listed" description="Candidates for your constituency have not been published yet." testid="election-detail-no-candidates" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
