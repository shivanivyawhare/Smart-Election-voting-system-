import { useQuery } from "@tanstack/react-query";
import { Loader2, ScanFace } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { VoterListResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

const CONDITIONS = [
  "identityVerified — the identity-provider transaction completed",
  "faceVerified — a face capture passed provider scoring",
  "livenessVerified — the randomised challenge sequence passed",
  "voterActive — registration approved and not suspended",
  "electionActive — election is OPEN and inside its voting window",
  "voterEligibleForElection — voter's constituency is on the ballot",
  "voterHasNotAlreadyVoted — no vote mark exists (DB-enforced)",
];

export default function Eligibility() {
  const q = useQuery({
    queryKey: ["admin", "voters", "", "all", 1],
    queryFn: () => apiGet<VoterListResponse>("/admin/voters?page=1&page_size=25"),
    retry: false,
  });

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError || !q.data) return <EmptyState icon={ScanFace} title="Eligibility data unavailable" description="Voter verification data could not be loaded." testid="eligibility-error" />;

  const items = q.data.items;
  const fully = items.filter((v) => v.identity_verified && v.face_verified && v.liveness_verified).length;
  const identity = items.filter((v) => v.identity_verified).length;
  const face = items.filter((v) => v.face_verified).length;
  const liveness = items.filter((v) => v.liveness_verified).length;

  return (
    <div data-testid="eligibility-page">
      <PageHeader
        title="Eligibility Engine"
        description="Every condition below must pass before a ballot is issued. The engine runs server-side on every ballot request — frontend state is never trusted."
        testid="eligibility-header"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ScanFace} label="Fully verified (page)" value={fully} tone="success" testid="eligibility-card-full" />
        <StatCard icon={ScanFace} label="Identity verified" value={identity} testid="eligibility-card-identity" />
        <StatCard icon={ScanFace} label="Face verified" value={face} testid="eligibility-card-face" />
        <StatCard icon={ScanFace} label="Liveness verified" value={liveness} testid="eligibility-card-liveness" />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="font-heading text-lg">ALLOW_VOTE conditions</CardTitle></CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm text-slate-700" data-testid="eligibility-conditions">
            {CONDITIONS.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                <span className="font-mono text-xs">{c}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-600">
            If every condition is true the engine returns ALLOW_VOTE; otherwise DENY_VOTE with a
            safe, human-readable reason. Internal details are never leaked to the voter.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
