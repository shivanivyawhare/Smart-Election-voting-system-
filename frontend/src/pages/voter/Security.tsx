import { useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AuthMe, Voter } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

const PROTECTIONS = [
  { icon: Lock, title: "Session security", text: "Your session lives in an httpOnly cookie — never readable by page scripts." },
  { icon: KeyRound, title: "Password storage", text: "Passwords are stored as PBKDF2-SHA256 hashes and never returned by any API." },
  { icon: ShieldCheck, title: "Ballot secrecy", text: "Your ballot is AES-256-GCM encrypted with no link to your identity record." },
];

export default function VoterSecurity() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<AuthMe>("/auth/me") });
  const voter = me.data?.user as Voter | undefined;

  if (me.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div data-testid="voter-security-page">
      <PageHeader
        title="Security & activity"
        description="How your account and ballot are protected, plus the current state of your verification factors."
        testid="voter-security-header"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {PROTECTIONS.map((p) => (
            <Card key={p.title} data-testid={`security-protection-${p.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="flex items-start gap-3 py-5">
                <div className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
                  <p.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-heading font-bold">{p.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{p.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader><CardTitle className="font-heading text-base">Suspicious activity</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                Failed sign-ins, verification failures and rate-limit events on your account are
                recorded as security events and reviewed by a Security Officer. No risk score
                alone results in an accusation — flagged activity is only marked for review.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="security-factors-card">
          <CardHeader><CardTitle className="font-heading text-base">Your factors</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Identity verification</span>
              <StatusBadge status={voter?.identity_verified ? "VERIFIED" : "PENDING"} testid="security-factor-identity" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Face verification</span>
              <StatusBadge status={voter?.face_verified ? "VERIFIED" : "PENDING"} testid="security-factor-face" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Liveness detection</span>
              <StatusBadge status={voter?.liveness_verified ? "VERIFIED" : "PENDING"} testid="security-factor-liveness" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Account state</span>
              <StatusBadge status={voter?.suspended ? "SUSPENDED" : (voter?.status ?? "PENDING")} testid="security-factor-account" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
