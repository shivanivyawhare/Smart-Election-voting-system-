import { useQuery } from "@tanstack/react-query";
import { Activity, Boxes, CheckCircle2, Database, Loader2, Mail, MessageSquare, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { HealthData } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { SandboxStrip } from "@/components/SandboxStrip";

const CHECK_META: Record<string, { label: string; icon: typeof Database }> = {
  database: { label: "Database (MongoDB)", icon: Database },
  blockchain: { label: "Blockchain ledger", icon: Boxes },
  identity_provider: { label: "Identity provider", icon: ShieldCheck },
  face_provider: { label: "Face verification provider", icon: Activity },
  redis: { label: "Redis cache", icon: Activity },
  email_service: { label: "Email service", icon: Mail },
  sms_service: { label: "SMS service", icon: MessageSquare },
};

export default function SystemStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthData>("/health"),
    refetchInterval: 15_000,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10" data-testid="system-status-page">
      <SandboxStrip />
      <div className="mt-6">
        <PageHeader
          title="System Status"
          description="Real health checks against every service — nothing is reported connected without an actual check."
          testid="system-status-header"
        />
      </div>

      {health.isLoading && (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}

      {health.isError && (
        <Card className="border-red-200">
          <CardContent className="flex items-center gap-3 py-6 text-red-800">
            <XCircle className="h-6 w-6 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Status service unreachable</p>
              <p className="text-sm">Health checks could not be retrieved. The service may be restarting.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {health.data && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                {health.data.status === "healthy" ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="h-8 w-8 text-amber-500" aria-hidden="true" />
                )}
                <div>
                  <p className="font-heading text-lg font-bold" data-testid="system-status-overall">
                    {health.data.status === "healthy" ? "All systems operational" : health.data.status}
                  </p>
                  <p className="text-xs text-slate-500">
                    v{health.data.version} · uptime {Math.floor(health.data.uptime_seconds / 60)}m · checked {fmtDateTime(health.data.timestamp)}
                  </p>
                </div>
              </div>
              <StatusBadge
                status={health.data.development_mode ? "DEVELOPMENT_MODE" : "PRODUCTION_MODE"}
                testid="system-status-mode-badge"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="font-heading text-lg">Service checks</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Object.entries(health.data.checks).map(([key, check]) => {
                const meta = CHECK_META[key] ?? { label: key, icon: Activity };
                const ok = check.status === "healthy" || check.status === "not_configured";
                return (
                  <div
                    key={key}
                    data-testid={`system-check-${key.replace(/_/g, "-")}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <meta.icon className="h-5 w-5 text-slate-500" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold">{meta.label}</p>
                        <p className="text-xs text-slate-500">
                          {check.detail ?? (check.provider ? `provider: ${check.provider}` : "")}
                          {check.mode ? ` · ${check.mode}` : ""}
                          {check.network ? ` · ${check.network}` : ""}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={check.status.toUpperCase().replace(/_/g, " ")} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {health.data.ledger_verification && (
            <Card>
              <CardHeader><CardTitle className="font-heading text-lg">Ledger verification</CardTitle></CardHeader>
              <CardContent>
                <div
                  className={`flex items-center gap-3 rounded-lg border p-4 ${health.data.ledger_verification.valid ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
                  data-testid="system-status-ledger"
                >
                  {health.data.ledger_verification.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-heading font-bold">{health.data.ledger_verification.status ?? (health.data.ledger_verification.valid ? "CHAIN VALID" : "INTEGRITY VIOLATION DETECTED")}</p>
                    <p className="text-xs text-slate-600">{health.data.ledger_verification.blocks_checked} blocks checked</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
