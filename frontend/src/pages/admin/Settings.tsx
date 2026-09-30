import { useQuery } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AdminSettings } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminSettingsPage() {
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: () => apiGet<AdminSettings>("/admin/settings"), retry: false });

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError || !q.data) return <EmptyState icon={Settings2} title="Settings unavailable" description="System settings could not be loaded." testid="admin-settings-error" />;

  return (
    <div data-testid="admin-settings-page">
      <PageHeader
        title="System Settings"
        description="Provider configuration comes from server environment variables — secrets are never exposed to the browser."
        testid="admin-settings-header"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Provider configuration</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.entries(q.data.env).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm" data-testid={`setting-env-${key}`}>
                <span className="font-mono text-xs text-slate-600">{key}</span>
                <StatusBadge status={String(value).toUpperCase()} />
              </div>
            ))}
            <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-500">
              Only non-secret provider selectors are shown. API keys, client secrets and
              encryption keys are read server-side from backend/.env and never returned by any API.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-lg">Role permissions (RBAC)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Object.entries(q.data.roles).map(([role, perms]) => (
              <div key={role} data-testid={`setting-role-${role}`}>
                <p className="text-sm font-bold text-slate-900">{role.replace(/_/g, " ")}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {perms.map((p) => (
                    <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="font-heading text-lg">Operational thresholds</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(q.data.settings).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No overrides configured — defaults apply (max 5 face attempts per 24h, 3 liveness
                attempts per session, 15-minute voting sessions).
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(q.data.settings).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm" data-testid={`setting-value-${k}`}>
                    <span className="font-mono text-xs">{k}</span>
                    <span className="font-semibold">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
