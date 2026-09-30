import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Vote } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Election } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export default function VoterElections() {
  const electionsQ = useQuery({
    queryKey: ["voter", "elections"],
    queryFn: () => apiGet<Election[]>("/elections"),
    retry: false,
  });
  const elections = electionsQ.data ?? [];

  return (
    <div data-testid="voter-elections-page">
      <PageHeader
        title="Elections"
        description="Every election, with your eligibility evaluated server-side for each one."
        testid="voter-elections-header"
      />

      {electionsQ.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {electionsQ.isError && (
        <EmptyState icon={Vote} title="Elections unavailable" description="The election service could not be reached. Please retry shortly." testid="voter-elections-error" />
      )}
      {!electionsQ.isLoading && !electionsQ.isError && elections.length === 0 && (
        <EmptyState icon={Vote} title="No elections yet" description="Elections appear here once the commission publishes them." testid="voter-elections-empty" />
      )}

      <div className="flex flex-col gap-4">
        {elections.map((e) => {
          const elig = e.eligibility;
          return (
            <Card key={e.id} data-testid={`voter-election-card-${e.election_code}`}>
              <CardContent className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-bold text-slate-900">{e.name}</h2>
                      <StatusBadge status={e.status} testid={`voter-election-status-${e.election_code}`} />
                      {elig?.has_voted && <StatusBadge status="VOTED" testid={`voter-election-voted-${e.election_code}`} />}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 font-mono">{e.election_code}</p>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600">{e.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Voting window: {fmtDateTime(e.start_at)} → {fmtDateTime(e.end_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link to={`/voter/election/${e.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid={`voter-election-details-${e.election_code}`}>
                      View details
                    </Link>
                    {elig?.allowed && (
                      <Link to={`/voter/ballot/${e.id}`} className={cn(buttonVariants({ size: "sm" }))} data-testid={`voter-election-vote-${e.election_code}`}>
                        Cast vote
                      </Link>
                    )}
                  </div>
                </div>

                {/* Eligibility checklist — server-evaluated */}
                {elig && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-4" data-testid={`voter-eligibility-${e.election_code}`}>
                    <p className={`text-sm font-semibold ${elig.allowed ? "text-emerald-800" : "text-amber-800"}`}>
                      {elig.message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {elig.checks.map((c) => (
                        <span
                          key={c.code}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                          data-testid={`eligibility-check-${c.code.toLowerCase()}`}
                        >
                          {c.passed ? "✓" : "✗"} {c.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
