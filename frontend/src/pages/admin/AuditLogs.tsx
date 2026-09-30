import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileClock, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AuditListResponse } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { HashText } from "@/components/HashText";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function AuditLogs() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin", "audit", action, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: "25" });
      if (action) params.set("action", action);
      return apiGet<AuditListResponse>(`/audit?${params.toString()}`);
    },
    retry: false,
  });

  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div data-testid="audit-logs-page">
      <PageHeader
        title="Audit Logs"
        description="Append-only and hash-chained. Each entry links to the previous hash and is anchored into the ledger — there is no edit or delete path in the application."
        testid="audit-logs-header"
      />

      <div className="mb-4 max-w-sm">
        <Input
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          placeholder="Filter by action (e.g. VOTE_CAST)"
          data-testid="audit-action-filter"
        />
      </div>

      {q.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {q.isError && <EmptyState icon={FileClock} title="Audit log unavailable" description="Entries could not be loaded." testid="audit-logs-error" />}
      {data?.items.length === 0 && <EmptyState icon={FileClock} title="No matching entries" description="Adjust the action filter." testid="audit-logs-empty" />}

      {!!data?.items.length && (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm" data-testid="audit-logs-table">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Resource</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Hash</th>
                  <th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100" data-testid={`audit-row-${e.seq}`}>
                    <td className="py-2.5 pr-3 font-mono text-xs">{e.seq}</td>
                    <td className="py-2.5 pr-3 font-semibold">{e.action.replace(/_/g, " ")}</td>
                    <td className="py-2.5 pr-3 text-xs">
                      <span className="block">{e.actor_role}</span>
                      <span className="font-mono text-[10px] text-slate-400">{e.actor_id.slice(0, 8)}…</span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{e.resource_type}</td>
                    <td className="py-2.5 pr-3"><StatusBadge status={e.result.toUpperCase()} /></td>
                    <td className="py-2.5 pr-3"><HashText hash={e.current_hash} testid={`audit-hash-${e.seq}`} head={8} tail={4} /></td>
                    <td className="py-2.5 text-xs text-slate-500">{fmtDateTime(e.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500" data-testid="audit-total-count">{data.total} entries · page {data.page} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="audit-prev-page">Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="audit-next-page">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
