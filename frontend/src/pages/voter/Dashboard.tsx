import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRight, Camera, CheckCircle2, Clock, Fingerprint, Loader2,
  ReceiptText, ScanFace, Vote,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AuthMe, Election, Receipt, SecurityEvent, Voter } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

const STEPS = [
  { key: "identity_verified", label: "Identity verification", icon: Fingerprint, href: "/voter/verify-identity", testid: "dashboard-step-identity" },
  { key: "face_verified", label: "Face verification", icon: Camera, href: "/voter/face-verification", testid: "dashboard-step-face" },
  { key: "liveness_verified", label: "Liveness detection", icon: ScanFace, href: "/voter/liveness", testid: "dashboard-step-liveness" },
] as const;

export default function VoterDashboard() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<AuthMe>("/auth/me") });
  const voter = me.data?.user as Voter | undefined;
  const electionsQ = useQuery({
    queryKey: ["voter", "elections"],
    queryFn: () => apiGet<Election[]>("/elections"),
    retry: false,
  });
  const receiptsQ = useQuery({
    queryKey: ["voter", "receipts"],
    queryFn: () => apiGet<Receipt[]>("/voting/receipts"),
    retry: false,
  });

  const elections = electionsQ.data ?? [];
  const active = elections.filter((e) => e.status === "OPEN");
  const upcoming = elections.filter((e) => ["SCHEDULED", "DRAFT"].includes(e.status));
  const completed = elections.filter((e) => ["CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"].includes(e.status));
  const eligibleActive = active.filter((e) => e.eligibility?.allowed);
  const nextStep = STEPS.find((s) => voter && !voter[s.key]);

  if (me.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div data-testid="voter-dashboard-page">
      <PageHeader
        title={`Welcome, ${voter?.full_name ?? "voter"}`}
        description="Your verification status, eligible elections and ballot receipts."
        testid="voter-dashboard-header"
      />

      {/* Registration status */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registration</p>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={voter?.status ?? "PENDING"} testid="dashboard-registration-status" />
              <span className="font-mono text-xs text-slate-500">{voter?.voter_ref_masked}</span>
            </div>
          </div>
          {voter?.status === "PENDING" && (
            <p className="max-w-md text-sm text-amber-800" data-testid="dashboard-pending-note">
              Your registration is awaiting administrator approval. You can complete all
              verification steps now — voting unlocks once approved.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Verification steps */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step) => {
          const done = !!voter?.[step.key];
          return (
            <Card key={step.key} data-testid={step.testid} className={done ? "border-emerald-200" : "border-amber-200"}>
              <CardContent className="py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn("rounded-lg p-2", done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <StatusBadge status={done ? "VERIFIED" : "PENDING"} testid={`${step.testid}-badge`} />
                </div>
                <p className="mt-3 font-heading text-sm font-bold">{step.label}</p>
                {!done && (
                  <Link to={step.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline" data-testid={`${step.testid}-link`}>
                    Complete this step <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {nextStep && (
        <Card className="mb-6 border-sky-200 bg-sky-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-sky-700" aria-hidden="true" />
              <div>
                <p className="font-heading font-bold text-sky-900">Next: {nextStep.label}</p>
                <p className="text-sm text-sky-800">Complete all three verification steps to unlock voting.</p>
              </div>
            </div>
            <Link to={nextStep.href} className={cn(buttonVariants())} data-testid="dashboard-next-step-button">
              Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Elections */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="font-heading text-lg">Elections</CardTitle>
              <Link to="/voter/elections" className="text-sm font-semibold text-[#1D4ED8] hover:underline" data-testid="dashboard-all-elections-link">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {electionsQ.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />}
              {electionsQ.isError && (
                <p className="text-sm text-muted-foreground" data-testid="dashboard-elections-error">
                  Elections could not be loaded right now. Please retry shortly.
                </p>
              )}
              {!electionsQ.isLoading && !electionsQ.isError && elections.length === 0 && (
                <EmptyState icon={Vote} title="No elections yet" description="Elections will appear here when the commission publishes them." testid="dashboard-no-elections" />
              )}
              {active.concat(upcoming).slice(0, 4).map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-4" data-testid={`dashboard-election-${e.election_code}`}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{e.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fmtDateTime(e.start_at)} → {fmtDateTime(e.end_at)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{e.eligibility?.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.status} />
                    {e.eligibility?.has_voted ? (
                      <StatusBadge status="VOTED" testid={`dashboard-voted-${e.election_code}`} />
                    ) : e.eligibility?.allowed ? (
                      <Link to={`/voter/election/${e.id}`} className={cn(buttonVariants({ size: "sm" }))} data-testid={`dashboard-vote-now-${e.election_code}`}>
                        Vote now
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                <div className="rounded-lg bg-slate-50 py-3">
                  <p className="font-heading text-xl font-bold" data-testid="dashboard-count-active">{active.length}</p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-3">
                  <p className="font-heading text-xl font-bold" data-testid="dashboard-count-upcoming">{upcoming.length}</p>
                  <p className="text-xs text-slate-500">Upcoming</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-3">
                  <p className="font-heading text-xl font-bold" data-testid="dashboard-count-completed">{completed.length}</p>
                  <p className="text-xs text-slate-500">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card data-testid="dashboard-eligibility-card">
            <CardHeader><CardTitle className="font-heading text-base">Voting status</CardTitle></CardHeader>
            <CardContent>
              {eligibleActive.length > 0 ? (
                <div className="flex items-start gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  You are eligible to vote in {eligibleActive.length} open election(s).
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                  No open election is currently available to you.
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="dashboard-receipts-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="font-heading text-base">Your receipts</CardTitle>
              <Link to="/voter/receipt" className="text-xs font-semibold text-[#1D4ED8] hover:underline" data-testid="dashboard-receipts-link">
                All →
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(receiptsQ.data ?? []).slice(0, 3).map((r) => (
                <Link
                  key={r.receipt_id}
                  to={`/voter/vote-verification?receipt=${r.receipt_id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs hover:bg-slate-50"
                  data-testid={`dashboard-receipt-${r.receipt_id}`}
                >
                  <span className="font-mono">{r.receipt_id}</span>
                  <span className="text-slate-500">block #{r.block_index ?? "—"}</span>
                </Link>
              ))}
              {(!receiptsQ.data || receiptsQ.data.length === 0) && (
                <p className="text-sm text-muted-foreground" data-testid="dashboard-no-receipts">
                  No ballots cast yet. Your receipt appears here after voting.
                </p>
              )}
              <Link to="/voter/vote-verification" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1")} data-testid="dashboard-verify-ballot-button">
                <ReceiptText className="h-4 w-4" aria-hidden="true" /> Verify a ballot
              </Link>
            </CardContent>
          </Card>

          <SecurityAlertsCard />
        </div>
      </div>
    </div>
  );
}

function SecurityAlertsCard() {
  // Voter-scoped alerts come from the voter's own security page; this is a light summary.
  return (
    <Card data-testid="dashboard-security-card">
      <CardHeader><CardTitle className="font-heading text-base">Security</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Review sign-in activity and verification attempts on your account.
        </p>
        <Link to="/voter/security" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")} data-testid="dashboard-security-link">
          Security & activity
        </Link>
      </CardContent>
    </Card>
  );
}
