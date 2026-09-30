import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Constituency, MonitorResponse } from "@/lib/types";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export default function VotingMonitor() {
  const q = useQuery({
    queryKey: ["admin", "voting-monitor"],
    queryFn: () => apiGet<MonitorResponse>("/admin/voting/monitor"),
    refetchInterval: 15_000,
    retry: false,
  });
  const constituenciesQ = useQuery({ queryKey: ["public", "constituencies"], queryFn: () => apiGet<Constituency[]>("/constituencies") });
  const names = new Map((constituenciesQ.data ?? []).map((c) => [c.id, c.name]));

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError || !q.data) return <EmptyState icon={Activity} title="Monitor unavailable" description="Live voting telemetry could not be loaded." testid="voting-monitor-error" />;

  const m = q.data;
  return (
    <div data-testid="voting-monitor-page">
      <PageHeader
        title="Voting Monitor"
        description="Live ballot activity. Vote records carry no candidate information — only that a ballot was recorded."
        testid="voting-monitor-header"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Activity} label="Total votes recorded" value={m.total_votes} tone="navy" testid="monitor-total-votes" />
        <StatCard icon={Activity} label="Active voting sessions" value={m.active_sessions} tone="success" testid="monitor-active-sessions" />
        <StatCard icon={Activity} label="Constituencies reporting" value={Object.keys(m.votes_by_constituency).length} testid="monitor-constituencies" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Votes by constituency</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(m.votes_by_constituency).map(([cid, count]) => (
              <div key={cid} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm" data-testid={`monitor-constituency-${cid}`}>
                <span>{names.get(cid) ?? cid}</span>
                <span className="font-mono font-semibold">{count}</span>
              </div>
            ))}
            {Object.keys(m.votes_by_constituency).length === 0 && <p className="text-sm text-muted-foreground">No votes recorded yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Recent ballot records</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm" data-testid="monitor-recent-votes-table">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Receipt</th>
                  <th className="py-2 pr-3">Constituency</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {m.recent_votes.map((v) => (
                  <tr key={v.receipt_id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{v.receipt_id}</td>
                    <td className="py-2 pr-3 text-xs">{names.get(v.constituency_id ?? "") ?? "—"}</td>
                    <td className="py-2 text-xs text-slate-500" title={fmtDateTime(v.voted_at)}>{timeAgo(v.voted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.recent_votes.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No ballots recorded yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
