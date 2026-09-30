import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AuthMe, Voter } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";

export default function VoterProfile() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<AuthMe>("/auth/me") });
  const voter = me.data?.user as Voter | undefined;

  if (me.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const rows: { label: string; value: string; testid: string }[] = [
    { label: "Full name", value: voter?.full_name ?? "—", testid: "profile-name" },
    { label: "Email", value: voter?.email ?? "—", testid: "profile-email" },
    { label: "Mobile", value: voter?.mobile ?? "—", testid: "profile-mobile" },
    { label: "Date of birth", value: fmtDate(voter?.date_of_birth), testid: "profile-dob" },
    { label: "State", value: voter?.state ?? "—", testid: "profile-state" },
    { label: "District", value: voter?.district ?? "—", testid: "profile-district" },
    { label: "Voter reference (masked)", value: voter?.voter_ref_masked ?? "—", testid: "profile-voter-ref" },
    { label: "Identity reference (masked)", value: voter?.identity_masked ?? "Not verified", testid: "profile-identity-masked" },
    { label: "Registered", value: fmtDateTime(voter?.created_at), testid: "profile-created" },
  ];

  return (
    <div data-testid="voter-profile-page">
      <PageHeader
        title="Profile"
        description="Identity references are always masked. Full reference numbers are never displayed or stored in readable form."
        testid="voter-profile-header"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="font-heading text-lg">Registration details</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100">
              {rows.map((r) => (
                <div key={r.label} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <dt className="text-sm text-slate-500">{r.label}</dt>
                  <dd className="text-sm font-semibold text-slate-900" data-testid={r.testid}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Verification</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Registration</span>
              <StatusBadge status={voter?.status ?? "PENDING"} testid="profile-status-registration" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Identity</span>
              <StatusBadge status={voter?.identity_verified ? "VERIFIED" : "PENDING"} testid="profile-status-identity" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Face</span>
              <StatusBadge status={voter?.face_verified ? "VERIFIED" : "PENDING"} testid="profile-status-face" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Liveness</span>
              <StatusBadge status={voter?.liveness_verified ? "VERIFIED" : "PENDING"} testid="profile-status-liveness" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
