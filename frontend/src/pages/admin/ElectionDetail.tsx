import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, Vote } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AdminElectionDetail, Constituency } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminElectionDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["admin", "election", id],
    queryFn: () => apiGet<AdminElectionDetail>(`/admin/elections/${id}`),
    retry: false,
  });
  const constituenciesQ = useQuery({
    queryKey: ["public", "constituencies"],
    queryFn: () => apiGet<Constituency[]>("/constituencies"),
  });

  if (q.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (q.isError || !q.data) {
    return <EmptyState icon={Vote} title="Election unavailable" description="This election could not be loaded." testid="admin-election-detail-error" />;
  }

  const e = q.data;
  const names = new Map((constituenciesQ.data ?? []).map((c) => [c.id, c.name]));
  const turnout = e.eligible_voters ? (e.votes_cast / e.eligible_voters) * 100 : 0;

  return (
    <div data-testid="admin-election-detail-page">
      <PageHeader
        title={e.name}
        description={`${e.election_code} · ${e.election_type} · ${fmtDateTime(e.start_at)} → ${fmtDateTime(e.end_at)}`}
        testid="admin-election-detail-header"
        actions={<StatusBadge status={e.status} testid="admin-election-detail-status" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Eligible voters" value={e.eligible_voters} testid="election-detail-eligible-card" />
        <StatCard icon={Vote} label="Votes cast" value={e.votes_cast} tone="navy" testid="election-detail-votes-card" />
        <StatCard icon={Users} label="Candidates" value={e.candidates.length} testid="election-detail-candidates-card" />
        <StatCard icon={Vote} label="Turnout" value={`${turnout.toFixed(1)}%`} tone="warning" testid="election-detail-turnout-card" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Candidates</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {e.candidates.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2" data-testid={`election-detail-candidate-${c.id}`}>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-[#0B192C] font-mono text-[10px] font-bold text-white">{c.symbol}</span>
                  <div>
                    <p className="text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.party} · {names.get(c.constituency_id) ?? "—"}</p>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
            {e.candidates.length === 0 && <p className="text-sm text-muted-foreground">No candidates added yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Votes by constituency</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(e.votes_by_constituency).map(([cid, count]) => (
              <div key={cid} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm" data-testid={`election-votes-constituency-${cid}`}>
                <span>{names.get(cid) ?? cid}</span>
                <span className="font-mono font-semibold">{count}</span>
              </div>
            ))}
            {Object.keys(e.votes_by_constituency).length === 0 && <p className="text-sm text-muted-foreground">No votes cast yet.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Recent vote records</CardTitle>
            <p className="text-xs text-slate-500">
              Vote marks show THAT a ballot was cast — never for whom. No candidate choice is stored against any voter.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="election-detail-votes-table">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Receipt</th>
                  <th className="py-2 pr-4">Constituency</th>
                  <th className="py-2">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {e.recent_votes.map((v) => (
                  <tr key={v.receipt_id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs">{v.receipt_id}</td>
                    <td className="py-2 pr-4">{names.get(v.constituency_id ?? "") ?? "—"}</td>
                    <td className="py-2 text-xs text-slate-500">{fmtDateTime(v.voted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {e.recent_votes.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No votes recorded yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
