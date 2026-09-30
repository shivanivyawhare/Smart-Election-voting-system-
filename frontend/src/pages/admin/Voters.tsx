import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Admin, VoterListResponse } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { can } from "@/lib/permissions";
import { useAuthMe } from "@/hooks/useAuthMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses", PENDING: "Pending", APPROVED: "Approved", SUSPENDED: "Suspended",
};

export default function AdminVoters() {
  const { data: auth } = useAuthMe();
  const role = (auth?.user as Admin | undefined)?.role;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["admin", "voters", search, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: "25" });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      return apiGet<VoterListResponse>(`/admin/voters?${params.toString()}`);
    },
    retry: false,
  });

  const moderate = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "suspend" | "unsuspend" }) =>
      apiPost(`/admin/voters/${vars.id}/${vars.action}`),
    onSuccess: async (_d, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "voters"] });
      toast.success(`Voter ${vars.action === "approve" ? "approved" : vars.action === "suspend" ? "suspended" : "reinstated"}`);
    },
    onError: (e) => {
      const d = e instanceof ApiError && e.body && typeof e.body === "object" ? (e.body as { detail?: string }).detail : undefined;
      toast.error(typeof d === "string" ? d : "The action could not be completed.");
    },
  });

  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div data-testid="admin-voters-page">
      <PageHeader
        title="Voter management"
        description="Search, approve and suspend voters. Verification metadata is visible; a voter's candidate choice is structurally invisible to every admin role."
        testid="admin-voters-header"
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email or voter reference"
            className="pl-9"
            data-testid="admin-voters-search-input"
          />
        </div>
        <div className="w-full sm:w-52">
          <Select value={status} onValueChange={(v: string) => { setStatus(v); setPage(1); }}>
            <SelectTrigger data-testid="admin-voters-status-filter">
              <SelectValue>{(v) => STATUS_LABELS[v as string] ?? "All statuses"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {q.isError && <EmptyState icon={Users} title="Voters unavailable" description="The voter list could not be loaded." testid="admin-voters-error" />}
      {data && data.items.length === 0 && (
        <EmptyState icon={Users} title="No voters match" description="Adjust your search or filter." testid="admin-voters-empty" />
      )}

      {data && data.items.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm" data-testid="admin-voters-table">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Voter</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Verification</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Votes</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((v) => (
                  <tr key={v.id} className="border-b border-slate-100" data-testid={`admin-voter-row-${v.id}`}>
                    <td className="py-3 pr-4">
                      <Link to={`/admin/voters/${v.id}`} className="font-semibold text-slate-900 hover:underline" data-testid={`admin-voter-link-${v.id}`}>
                        {v.full_name}
                      </Link>
                      <p className="text-xs text-slate-500">{v.email}</p>
                      <p className="text-xs text-slate-400">Registered {fmtDateTime(v.created_at)}</p>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{v.voter_ref_masked}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {[["ID", v.identity_verified], ["Face", v.face_verified], ["Live", v.liveness_verified]].map(([label, ok]) => (
                          <span key={String(label)} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4"><StatusBadge status={v.status} testid={`admin-voter-status-${v.id}`} /></td>
                    <td className="py-3 pr-4 font-mono text-xs">{v.votes_cast ?? 0}</td>
                    <td className="py-3">
                      {can(role, "voter:moderate") && (
                        <div className="flex flex-wrap gap-1.5">
                          {v.status === "PENDING" && (
                            <Button size="xs" onClick={() => moderate.mutate({ id: v.id, action: "approve" })} data-testid={`admin-voter-approve-${v.id}`}>
                              Approve
                            </Button>
                          )}
                          {v.status !== "SUSPENDED" ? (
                            <ConfirmDialog
                              triggerLabel="Suspend"
                              triggerVariant="destructive"
                              triggerSize="xs"
                              title="Suspend this voter?"
                              description={`${v.full_name} will be unable to sign in or vote until reinstated. This action is audited.`}
                              confirmLabel="Suspend voter"
                              testid={`admin-voter-suspend-${v.id}`}
                              onConfirm={() => moderate.mutateAsync({ id: v.id, action: "suspend" })}
                            />
                          ) : (
                            <Button size="xs" variant="outline" onClick={() => moderate.mutate({ id: v.id, action: "unsuspend" })} data-testid={`admin-voter-unsuspend-${v.id}`}>
                              Reinstate
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500" data-testid="admin-voters-count">
                {data.total} voters · page {data.page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="admin-voters-prev-page">Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="admin-voters-next-page">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
