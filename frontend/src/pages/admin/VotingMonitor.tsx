import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Constituency, MonitorResponse, TurnoutAlertsResponse } from "@/lib/types";
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
  const alertsQ = useQuery({
    queryKey: ["admin", "turnout-alerts"],
    queryFn: () => apiGet<TurnoutAlertsResponse>("/admin/turnout/alerts"),
    refetchInterval: 20_000,
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
        <Card className="lg:col-span-2" data-testid="turnout-alerts-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-lg">Turnout alerts</CardTitle>
            <span className="text-xs text-slate-500" data-testid="turnout-alerts-count">
              {alertsQ.data?.alert_count ?? 0} lagging constituenc{(alertsQ.data?.alert_count ?? 0) === 1 ? "y" : "ies"}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(alertsQ.data?.open_elections ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="turnout-alerts-no-open">No election is currently open.</p>
            )}
            {(alertsQ.data?.alerts ?? []).length === 0 && (alertsQ.data?.open_elections ?? []).length > 0 && (
              <p className="flex items-center gap-2 text-sm text-emerald-700" data-testid="turnout-alerts-empty">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                All constituencies are tracking close to the election mean turnout.
              </p>
            )}
            {(alertsQ.data?.alerts ?? []).map((a) => (
              <div
                key={`${a.election_id}-${a.constituency_id}`}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 text-sm ${
                  a.alert_level === "CRITICAL" ? "border-red-300 bg-red-50"
                    : a.alert_level === "HIGH" ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
                }`}
                data-testid={`turnout-alert-${a.constituency_id}`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`mt-0.5 h-5 w-5 ${a.alert_level === "CRITICAL" ? "text-red-600" : "text-amber-600"}`} aria-hidden="true" />
                  <div>
                    <p className="font-heading font-bold">{a.constituency_name}</p>
                    <p className="text-xs text-slate-600">
                      {a.election_name} · {a.votes_cast} of {a.eligible_voters} eligible voters have voted
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-base font-bold">{a.turnout_pct}%</p>
                  <p className="text-xs text-slate-600">
                    {a.gap_pct}% vs {a.mean_turnout_pct}% mean · <span className="font-semibold">{a.alert_level}</span>
                  </p>
                </div>
              </div>
            ))}
            {(alertsQ.data?.open_elections ?? []).map((e) => (
              <div key={e.election_id} className="rounded-lg border border-slate-100 p-3" data-testid={`turnout-election-${e.election_code}`}>
                <p className="text-xs uppercase tracking-wider text-slate-500">{e.election_name} · mean {e.mean_turnout_pct}%</p>
                <div className="mt-2 flex flex-col gap-2">
                  {e.constituencies.map((c) => (
                    <div key={c.constituency_id} className="flex items-center gap-3 text-xs" data-testid={`turnout-bar-${c.constituency_id}`}>
                      <span className="w-40 shrink-0 truncate">{c.constituency_name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${c.alert_level ? "bg-amber-500" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, c.turnout_pct)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right font-mono">{c.turnout_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

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
