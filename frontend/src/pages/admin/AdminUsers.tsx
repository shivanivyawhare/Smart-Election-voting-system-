import { useQuery } from "@tanstack/react-query";
import { Loader2, UserCog } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Admin } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminUsers() {
  const q = useQuery({ queryKey: ["admin", "admin-users"], queryFn: () => apiGet<Admin[]>("/admin/admin-users"), retry: false });

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError) {
    return (
      <EmptyState
        icon={UserCog}
        title="Administrator accounts unavailable"
        description="Only a SUPER_ADMIN may view administrator accounts. Your role does not hold this permission, or the service is unreachable."
        testid="admin-users-error"
      />
    );
  }

  return (
    <div data-testid="admin-users-page">
      <PageHeader
        title="Administrator accounts"
        description="Role-scoped administrator accounts. Only SUPER_ADMIN may view or create them."
        testid="admin-users-header"
      />
      <Card>
        <CardContent className="overflow-x-auto py-4">
          <table className="w-full text-sm" data-testid="admin-users-table">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((a) => (
                <tr key={a.id} className="border-b border-slate-100" data-testid={`admin-user-row-${a.email}`}>
                  <td className="py-3 pr-4 font-semibold">{a.full_name}</td>
                  <td className="py-3 pr-4 text-slate-600">{a.email}</td>
                  <td className="py-3 pr-4"><StatusBadge status={a.role} /></td>
                  <td className="py-3 pr-4"><StatusBadge status={a.status} /></td>
                  <td className="py-3 text-xs text-slate-500">{fmtDateTime(a.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
