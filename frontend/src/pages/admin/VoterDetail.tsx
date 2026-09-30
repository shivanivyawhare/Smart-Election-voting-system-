import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { VoterDetail } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminVoterDetail() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["admin", "voter", id],
    queryFn: () => apiGet<VoterDetail>(`/admin/voters/${id}`),
    retry: false,
  });

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError || !q.data) return <EmptyState icon={Users} title="Voter not found" description="This voter record could not be loaded." testid="admin-voter-detail-error" />;

  const { voter, identity_transactions, face, liveness, security_events, elections, votes_cast } = q.data;

  return (
    <div data-testid="admin-voter-detail-page">
      <PageHeader
        title={voter.full_name}
        description={`${voter.email} · ${voter.voter_ref_masked}`}
        testid="admin-voter-detail-header"
        actions={<StatusBadge status={voter.status} testid="admin-voter-detail-status" />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Verification status</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Identity</span><StatusBadge status={voter.identity_verified ? "VERIFIED" : "PENDING"} testid="voter-detail-identity-status" /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Face ({face.attempts} attempts)</span><StatusBadge status={face.verified ? "VERIFIED" : "PENDING"} testid="voter-detail-face-status" /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Liveness</span><StatusBadge status={liveness.verified ? "VERIFIED" : "PENDING"} testid="voter-detail-liveness-status" /></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Ballots cast</span><span className="font-mono text-sm font-semibold" data-testid="voter-detail-votes-cast">{votes_cast}</span></div>
            <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-500">
              The number of ballots is visible; the candidate chosen is not stored against any voter and cannot be retrieved by any admin role.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Identity transactions</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {identity_transactions.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs" data-testid={`voter-detail-txn-${t.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{t.id.slice(0, 8)}…</span>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-slate-500">
                  {t.provider} · {t.masked_ref} · {fmtDateTime(t.created_at)}
                </p>
              </div>
            ))}
            {identity_transactions.length === 0 && <p className="text-sm text-muted-foreground">No identity transactions recorded.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Security events</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {security_events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs" data-testid={`voter-detail-event-${ev.id}`}>
                <span>{ev.event_type.replace(/_/g, " ")}</span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={ev.severity} />
                  <span className="text-slate-400">{fmtDateTime(ev.created_at)}</span>
                </span>
              </div>
            ))}
            {security_events.length === 0 && <p className="text-sm text-muted-foreground">No security events recorded.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Election eligibility</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {elections.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-100 px-3 py-2" data-testid={`voter-detail-election-${e.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{e.name}</span>
                  <StatusBadge status={e.eligibility.allowed ? "ELIGIBLE" : e.eligibility.reason} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{e.eligibility.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
