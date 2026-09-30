import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Lock, ShieldCheck, TriangleAlert, Vote } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Eligibility, Receipt, VoterElectionDetail } from "@/lib/types";

interface VotingSessionOut {
  session_id: string;
  election_id: string;
  status: string;
  expires_at: string;
  eligibility: Eligibility;
}
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

function detail(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const d = (error.body as { detail?: string }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function Ballot() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [stage, setStage] = useState<"IDLE" | "ENCRYPTING" | "COMMITTING" | "DONE">("IDLE");

  const electionQ = useQuery({
    queryKey: ["voter", "election", id],
    queryFn: () => apiGet<VoterElectionDetail>(`/elections/${id}`),
    retry: false,
  });

  const sessionQ = useQuery({
    queryKey: ["voter", "voting-session", id],
    queryFn: () => apiPost<VotingSessionOut>("/voting/session", { election_id: id }),
    enabled: !!electionQ.data?.eligibility?.allowed,
    retry: false,
    staleTime: 10 * 60_000,
  });

  const cast = useMutation({
    mutationFn: async () => {
      setStage("ENCRYPTING");
      // Idempotency-Key makes a retried submission return the original receipt.
      const res = await fetch("/api/voting/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          voting_session_id: sessionQ.data!.session_id,
          election_id: id,
          candidate_id: selected,
          confirm: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(res.status, body);
      }
      setStage("COMMITTING");
      return (await res.json()) as Receipt;
    },
    onSuccess: async (receipt) => {
      setStage("DONE");
      await queryClient.invalidateQueries({ queryKey: ["voter"] });
      toast.success("Vote recorded", { description: `Receipt ${receipt.receipt_id}` });
      navigate(`/voter/vote-success?receipt=${receipt.receipt_id}`);
    },
    onError: (error) => {
      setStage("IDLE");
      setReviewOpen(false);
      toast.error(detail(error, "Your vote could not be recorded. Nothing was saved — please retry."));
      electionQ.refetch();
    },
  });

  if (electionQ.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (electionQ.isError || !electionQ.data) {
    return <EmptyState icon={Vote} title="Ballot unavailable" description="This election could not be loaded. Please retry shortly." testid="ballot-error" />;
  }

  const e = electionQ.data;
  const elig = e.eligibility;

  if (!elig?.allowed) {
    return (
      <div data-testid="ballot-blocked">
        <PageHeader title="Ballot" description={e.name} />
        <Card className="border-amber-200">
          <CardContent className="flex items-start gap-3 py-6">
            <TriangleAlert className="mt-0.5 h-7 w-7 shrink-0 text-amber-500" aria-hidden="true" />
            <div>
              <p className="font-heading font-bold text-amber-900" data-testid="ballot-blocked-reason">{elig?.message}</p>
              <p className="mt-1 text-sm text-slate-600">
                Every condition below must pass before a ballot can be issued.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(elig?.checks ?? []).map((c) => (
                  <span key={c.code} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {c.passed ? "✓" : "✗"} {c.label}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Link to="/voter/dashboard" className={cn("mt-4 inline-block", "text-sm font-semibold text-[#1D4ED8] hover:underline")} data-testid="ballot-back-dashboard">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const candidates = e.voter_constituency
    ? e.candidates.filter((c) => c.constituency_id === e.voter_constituency!.id)
    : e.candidates;
  const chosen = candidates.find((c) => c.id === selected);

  return (
    <div data-testid="ballot-page">
      <PageHeader
        title="Official ballot"
        description={`${e.name} — ${e.voter_constituency?.name ?? "your constituency"}. Select one candidate, then review and confirm.`}
        testid="ballot-header"
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
        <Lock className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        Your choice is encrypted with AES-256-GCM and stored with no link to your identity.
        Your receipt proves inclusion without revealing your vote.
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-lg">Candidates</CardTitle></CardHeader>
        <CardContent>
          <fieldset className="grid gap-3 sm:grid-cols-2" data-testid="ballot-candidate-list">
            <legend className="sr-only">Select one candidate</legend>
            {candidates.map((c, i) => {
              const active = selected === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(c.id)}
                  data-testid={`candidate-vote-button-${i + 1}`}
                  className={cn(
                    "flex min-h-[88px] items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                    active ? "border-[#1D4ED8] bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0B192C] font-mono text-xs font-bold text-white">
                    {c.symbol}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.party}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{c.description}</p>
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />}
                </button>
              );
            })}
          </fieldset>

          {candidates.length === 0 && (
            <EmptyState icon={Vote} title="No candidates on this ballot" description="No active candidates are listed for your constituency in this election." testid="ballot-no-candidates" />
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              disabled={!selected || sessionQ.isLoading}
              onClick={() => setReviewOpen(true)}
              data-testid="ballot-review-button"
            >
              {sessionQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              Review my vote
            </Button>
            {sessionQ.isError && (
              <p className="text-xs font-medium text-destructive" data-testid="ballot-session-error">
                A voting session could not be opened. Reload the page to try again.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Review + confirm */}
      <Dialog open={reviewOpen} onOpenChange={(o) => { if (!cast.isPending) setReviewOpen(o); }}>
        <DialogContent data-testid="ballot-review-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold">Review your vote</DialogTitle>
            <DialogDescription>
              Confirming is final and cannot be changed. Exactly one vote is recorded per voter
              per election.
            </DialogDescription>
          </DialogHeader>
          {chosen && (
            <div className="rounded-xl border-2 border-[#1D4ED8] bg-blue-50 p-4" data-testid="ballot-review-selection">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0B192C] font-mono text-xs font-bold text-white">
                  {chosen.symbol}
                </div>
                <div>
                  <p className="font-semibold text-slate-900" data-testid="ballot-review-candidate-name">{chosen.name}</p>
                  <p className="text-xs text-slate-600">{chosen.party}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Election: {e.name} · Constituency: {e.voter_constituency?.name ?? "—"}
              </p>
            </div>
          )}
          {cast.isPending && (
            <ol className="flex flex-col gap-1.5 text-xs text-slate-600" data-testid="ballot-progress">
              <li className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Encrypting ballot (AES-256-GCM)
              </li>
              {stage === "COMMITTING" && (
                <li className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Committing integrity hash to the ledger
                </li>
              )}
            </ol>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={cast.isPending} data-testid="ballot-review-cancel">
              Go back
            </Button>
            <Button onClick={() => cast.mutate()} disabled={cast.isPending} data-testid="ballot-confirm-vote-button">
              {cast.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Vote className="h-4 w-4" aria-hidden="true" />}
              Confirm & cast vote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
