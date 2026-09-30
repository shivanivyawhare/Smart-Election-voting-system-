import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { SecurityEvent } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

interface SecuritySummary {
  failed_logins_24h: number;
  locked_accounts: number;
  failed_identity_24h: number;
  failed_liveness_24h: number;
  rate_limited_24h: number;
  duplicate_vote_attempts_24h: number;
  open_fraud_flags: number;
  events_by_type: Record<string, number>;
  events_by_severity: Record<string, number>;
  suspicious_ips: { ip: string; events: number }[];
  window: string;
}

export default function SecurityMonitor() {
  const summaryQ = useQuery({
    queryKey: ["admin", "security-summary"],
    queryFn: () => apiGet<SecuritySummary>("/security/summary"),
    refetchInterval: 30_000,
    retry: false,
  });
  const eventsQ = useQuery({
    queryKey: ["admin", "security-events"],
    queryFn: () => apiGet<{ total: number; items: SecurityEvent[] }>("/security/events?limit=100"),
    retry: false,
  });

  if (summaryQ.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (summaryQ.isError || !summaryQ.data) return <EmptyState icon={ShieldCheck} title="Security monitor unavailable" description="Security telemetry could not be loaded." testid="security-monitor-error" />;

  const s = summaryQ.data;

  return (
    <div data-testid="security-monitor-page">
      <PageHeader
        title="Security Monitor"
        description={`Authentication, verification and abuse telemetry over the last ${s.window}.`}
        testid="security-monitor-header"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Failed logins" value={s.failed_logins_24h} tone="warning" testid="security-card-failed-logins" />
        <StatCard icon={ShieldCheck} label="Locked accounts" value={s.locked_accounts} tone="danger" testid="security-card-locked" />
        <StatCard icon={ShieldCheck} label="Failed identity checks" value={s.failed_identity_24h} tone="warning" testid="security-card-identity" />
        <StatCard icon={ShieldCheck} label="Failed liveness" value={s.failed_liveness_24h} tone="danger" testid="security-card-liveness" />
        <StatCard icon={ShieldCheck} label="Rate-limit events" value={s.rate_limited_24h} testid="security-card-rate-limits" />
        <StatCard icon={ShieldCheck} label="Duplicate vote attempts" value={s.duplicate_vote_attempts_24h} tone="danger" testid="security-card-duplicate-votes" />
        <StatCard icon={ShieldCheck} label="Open fraud flags" value={s.open_fraud_flags} tone="warning" testid="security-card-flags" />
        <StatCard icon={ShieldCheck} label="Suspicious IPs" value={s.suspicious_ips.length} testid="security-card-ips" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Suspicious IP addresses</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {s.suspicious_ips.map((row) => (
              <div key={row.ip} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm" data-testid={`security-ip-${row.ip}`}>
                <span className="font-mono">{row.ip}</span>
                <span className="font-semibold">{row.events} events</span>
              </div>
            ))}
            {s.suspicious_ips.length === 0 && <p className="text-sm text-muted-foreground">No suspicious IP activity detected.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Events by type</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(s.events_by_type).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm" data-testid={`security-type-${type}`}>
                <span>{type.replace(/_/g, " ")}</span>
                <span className="font-mono font-semibold">{count}</span>
              </div>
            ))}
            {Object.keys(s.events_by_type).length === 0 && <p className="text-sm text-muted-foreground">No security events in this window.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="font-heading text-lg">Event stream</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm" data-testid="security-events-table">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">IP</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {(eventsQ.data?.items ?? []).map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{ev.event_type.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-3"><StatusBadge status={ev.severity} /></td>
                    <td className="py-2 pr-3 font-mono text-xs">{ev.ip_address ?? "—"}</td>
                    <td className="py-2 text-xs text-slate-500">{fmtDateTime(ev.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!eventsQ.data?.items.length && <p className="py-6 text-center text-sm text-muted-foreground">No security events recorded.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
