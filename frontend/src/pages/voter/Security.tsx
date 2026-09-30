import { useQuery } from "@tanstack/react-query";
import { History, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AuthMe, Voter, VoterActivityResponse } from "@/lib/types";
import { fmtDateTime, timeAgo } from "@/lib/format";
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
  const activity = useQuery({
    queryKey: ["voter", "activity"],
    queryFn: () => apiGet<VoterActivityResponse>("/voter/activity"),
    retry: false,
  });
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
          <Card data-testid="voter-activity-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading text-base">Verification &amp; sign-in history</CardTitle>
              <span className="flex items-center gap-1.5 text-xs text-slate-500" data-testid="voter-activity-signin-count">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                {activity.data?.sign_in_count ?? 0} sign-ins recorded
                {activity.data?.last_sign_in_at ? ` · last ${timeAgo(activity.data.last_sign_in_at)}` : ""}
              </span>
            </CardHeader>
            <CardContent className="max-h-96 overflow-y-auto">
              {activity.isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : (activity.data?.activity ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground" data-testid="voter-activity-empty">No activity has been recorded on this account yet.</p>
              ) : (
                <table className="w-full text-sm" data-testid="voter-activity-table">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3">Step</th>
                      <th className="py-2 pr-3">IP</th>
                      <th className="py-2">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activity.data?.activity ?? []).map((a) => (
                      <tr key={a.id} className="border-b border-slate-100" data-testid={`voter-activity-row-${a.id}`}>
                        <td className="py-2 pr-3 text-xs font-semibold">{a.action.replaceAll("_", " ")}</td>
                        <td className="py-2 pr-3 text-xs capitalize text-slate-600">{a.category}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-500">{a.ip_masked ?? "—"}</td>
                        <td className="py-2 text-xs text-slate-500" title={fmtDateTime(a.timestamp)}>{timeAgo(a.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-3 text-xs text-slate-500">
                These rows come from the append-only audit log — they can never be edited or removed.
                IP addresses are shown masked.
              </p>
            </CardContent>
          </Card>

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
