import { useQuery } from "@tanstack/react-query";
import {
  Activity, Boxes, CheckCircle2, Loader2, ShieldAlert, TriangleAlert, UserCheck,
  Users, Vote,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { apiGet } from "@/lib/api";
import type { DashboardData } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

const COLORS = ["#1D4ED8", "#D97706", "#059669", "#38BDF8", "#7C3AED"];

export default function AdminDashboard() {
  const q = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiGet<DashboardData>("/admin/dashboard"),
    refetchInterval: 30_000,
    retry: false,
  });

  if (q.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (q.isError || !q.data) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Dashboard unavailable"
        description="Live metrics could not be loaded. The service may be restarting — retry shortly."
        testid="admin-dashboard-error"
      />
    );
  }

  const { cards, charts } = q.data;

  return (
    <div data-testid="admin-dashboard-page">
      <PageHeader
        title="Election Commission Dashboard"
        description={`Live operational metrics · generated ${fmtDateTime(q.data.generated_at)}`}
        testid="admin-dashboard-header"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Vote} label="Total elections" value={cards.total_elections} hint={`${cards.active_elections} open · ${cards.upcoming_elections} upcoming`} testid="dashboard-card-elections" />
        <StatCard icon={Users} label="Registered voters" value={cards.registered_voters} hint={`${cards.pending_voters} pending approval`} tone="navy" testid="dashboard-card-voters" />
        <StatCard icon={UserCheck} label="Verified voters" value={cards.verified_voters} hint={`${cards.approved_voters} approved`} tone="success" testid="dashboard-card-verified" />
        <StatCard icon={CheckCircle2} label="Votes cast" value={cards.votes_cast} tone="success" testid="dashboard-card-votes" />
        <StatCard icon={TriangleAlert} label="Verification failures" value={cards.verification_failures} tone="warning" testid="dashboard-card-failures" />
        <StatCard icon={ShieldAlert} label="Suspicious attempts" value={cards.suspicious_attempts} hint={`${cards.open_fraud_flags} flags awaiting review`} tone="danger" testid="dashboard-card-suspicious" />
        <StatCard icon={Boxes} label="Ledger blocks" value={cards.blockchain_records} testid="dashboard-card-blocks" />
        <StatCard icon={Activity} label="System health" value={cards.system_health} tone={cards.system_health === "healthy" ? "success" : "danger"} testid="dashboard-card-health" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Votes per hour (last 24h)</CardTitle></CardHeader>
          <CardContent>
            {charts.votes_per_hour.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={charts.votes_per_hour} data-testid="chart-votes-per-hour">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(-5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(label: string) => label} formatter={(value: number) => [`${value}`, "Votes"]} />
                  <Line type="monotone" dataKey="votes" stroke="#1D4ED8" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No votes recorded in the last 24 hours.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Votes per constituency</CardTitle></CardHeader>
          <CardContent>
            {charts.votes_per_constituency.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.votes_per_constituency} data-testid="chart-votes-per-constituency">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="constituency" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => [`${value}`, "Votes"]} />
                  <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                    {charts.votes_per_constituency.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No votes recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Voter registrations (14 days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={charts.registrations} data-testid="chart-registrations">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [`${value}`, "Registrations"]} />
                <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Authentication success / failure</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={charts.auth_success_failure} data-testid="chart-auth">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v ?? "").slice(5)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="success" stackId="a" fill="#059669" />
                <Bar dataKey="failure" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="font-heading text-lg">Turnout by election</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts.turnout} data-testid="chart-turnout">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="election" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [`${value}%`, "Turnout"]} />
                <Bar dataKey="turnout_pct" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
