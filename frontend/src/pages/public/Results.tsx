import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, CheckCircle2, Loader2, ShieldCheck, TriangleAlert, Users, Vote, XCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { apiGet } from "@/lib/api";
import type { ElectionResult, PublicElection, ResultIntegrity } from "@/lib/types";
import { fmtDateTime, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { HashText } from "@/components/HashText";
import { PageHeader } from "@/components/PageHeader";

const PIE_COLORS = ["#1D4ED8", "#D97706", "#059669", "#38BDF8", "#7C3AED", "#DC2626"];

export default function Results() {
  const electionsQ = useQuery({
    queryKey: ["public", "elections"],
    queryFn: () => apiGet<PublicElection[]>("/elections/public"),
    retry: false,
  });
  const [electionId, setElectionId] = useState<string>("");
  const [constituencyId, setConstituencyId] = useState<string>("all");

  const elections = electionsQ.data ?? [];
  const selected = elections.find((e) => e.id === electionId) ?? elections.find((e) => e.results_published) ?? null;

  const resultQ = useQuery({
    queryKey: ["public", "result", selected?.id],
    queryFn: () => apiGet<ElectionResult>(`/results/${selected!.id}`),
    enabled: !!selected,
    retry: false,
  });
  const integrityQ = useQuery({
    queryKey: ["public", "result-integrity", selected?.id],
    queryFn: () => apiGet<ResultIntegrity>(`/results/${selected!.id}/integrity`),
    enabled: !!selected,
    refetchOnMount: "always",
  });

  const result = resultQ.data;
  const eligible = (result?.turnout ?? []).reduce((sum, t) => sum + t.eligible_voters, 0);
  const overallTurnout = eligible ? (result ? ((result.votes_cast / eligible) * 100) : 0) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10" data-testid="public-results-page">
      <PageHeader
        title="Public Results Portal"
        description="Published election results with turnout analytics and one-click cryptographic integrity verification."
        testid="results-header"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="w-full sm:w-96">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="results-election-select">
            Election
          </label>
          <Select
            value={selected?.id ?? ""}
            onValueChange={(v: string) => { setElectionId(v); setConstituencyId("all"); }}
          >
            <SelectTrigger id="results-election-select" data-testid="results-election-select">
              <SelectValue placeholder={electionsQ.isLoading ? "Loading elections…" : "Select an election"}>
                {selected ? selected.name : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {elections.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} {e.results_published ? "(published)" : "(results pending)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-72">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="results-constituency-select">
            Constituency view
          </label>
          <Select value={constituencyId} onValueChange={(v: string) => setConstituencyId(v)}>
            <SelectTrigger id="results-constituency-select" data-testid="results-constituency-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All constituencies</SelectItem>
              {(selected?.constituencies ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {electionsQ.isError && (
        <EmptyState
          icon={TriangleAlert}
          title="Results service unavailable"
          description="The results service could not be reached. This is likely temporary — the rest of the site still works."
          testid="results-offline"
        />
      )}

      {selected && !selected.results_published && (
        <EmptyState
          icon={Vote}
          title="Results not yet published"
          description="Results for this election are published only after the counting workflow completes. Nothing is shown before authorized publication."
          testid="results-not-published"
        />
      )}

      {selected?.results_published && (
        resultQ.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : result ? (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="font-heading text-xl">{result.election.name}</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">
                      {result.election.election_code} · Published {fmtDateTime(result.election.results_published_at)}
                    </p>
                  </div>
                  <StatusBadge status={result.election.status} testid="election-status-badge" />
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Users} label="Eligible voters" value={eligible} testid="results-eligible-card" />
                <StatCard icon={Vote} label="Votes cast" value={result.votes_cast} tone="navy" testid="results-cast-card" />
                <StatCard icon={CheckCircle2} label="Valid votes" value={result.valid_votes} tone="success" testid="results-valid-card" />
                <StatCard icon={BarChart3} label="Turnout" value={pct(overallTurnout)} tone="warning" testid="results-turnout-card" />
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader><CardTitle className="font-heading text-lg">Votes by candidate</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={result.results} data-testid="results-bar-chart">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`${value} votes`, "Votes"]} />
                      <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                        {result.results.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="font-heading text-lg">Vote share</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart data-testid="results-donut-chart">
                      <Pie data={result.results} dataKey="votes" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                        {result.results.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(value: number) => [`${value} votes`, "Votes"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Candidate totals table (with winner highlight) */}
            <Card>
              <CardHeader><CardTitle className="font-heading text-lg">Detailed totals</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="results-totals-table">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Candidate</th>
                      <th className="py-2 pr-4">Party</th>
                      <th className="py-2 pr-4 text-right">Votes</th>
                      <th className="py-2 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={r.candidate_id} className={`border-b border-slate-100 ${i === 0 ? "bg-emerald-50/50 font-semibold" : ""}`} data-testid={`results-row-${i + 1}`}>
                        <td className="py-2.5 pr-4">{i + 1}</td>
                        <td className="py-2.5 pr-4">{r.symbol} {r.name} {i === 0 && result.votes_cast > 0 && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Leading</span>}</td>
                        <td className="py-2.5 pr-4 text-slate-600">{r.party}</td>
                        <td className="py-2.5 pr-4 text-right font-mono">{r.votes}</td>
                        <td className="py-2.5 text-right font-mono">{pct(r.percentage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Integrity verification */}
            <Card data-testid="results-integrity-card">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="font-heading text-lg">Result integrity</CardTitle>
                <Button variant="outline" size="sm" data-testid="results-integrity-button" onClick={() => integrityQ.refetch()} disabled={integrityQ.isFetching}>
                  {integrityQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  Verify Result Integrity
                </Button>
              </CardHeader>
              <CardContent>
                {integrityQ.data ? (
                  <div
                    data-testid="results-integrity-result"
                    className={`flex flex-wrap items-center gap-3 rounded-lg border p-4 ${integrityQ.data.valid ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
                  >
                    {integrityQ.data.valid ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
                    )}
                    <div>
                      <p className={`font-heading font-bold ${integrityQ.data.valid ? "text-emerald-800" : "text-red-800"}`}>
                        {integrityQ.data.status}
                      </p>
                      <p className="text-xs text-slate-600">
                        Snapshot hash <HashText hash={integrityQ.data.snapshot_hash} testid="results-snapshot-hash" />
                        {integrityQ.data.ledger_block_index != null && ` · anchored at ledger block #${integrityQ.data.ledger_block_index}`}
                        {" "}· checked {fmtDateTime(integrityQ.data.checked_at)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Run a verification to recompute the published snapshot hash and confirm its ledger anchor.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyState
            icon={TriangleAlert}
            title={resultQ.isError ? "Could not load results" : "Loading results…"}
            description={resultQ.isError ? "The published result could not be loaded. Please retry shortly." : ""}
            testid="results-load-state"
          />
        )
      )}

      {!selected && !electionsQ.isError && !electionsQ.isLoading && (
        <EmptyState icon={Vote} title="No elections yet" description="Published results will appear here once an election completes." testid="results-empty" />
      )}
    </div>
  );
}
