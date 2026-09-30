import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";
import type { Election } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export default function Reports() {
  const q = useQuery({ queryKey: ["admin", "elections"], queryFn: () => apiGet<Election[]>("/admin/elections"), retry: false });
  const published = (q.data ?? []).filter((e) => e.status === "RESULTS_PUBLISHED");

  async function download(id: string, code: string) {
    const res = await fetch(`/api/admin/results/${id}/certificate`);
    if (!res.ok) { toast.error("The report could not be generated."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `result-certificate-${code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  }

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div data-testid="admin-reports-page">
      <PageHeader
        title="Reports"
        description="Official election result certificates — candidate totals, turnout, result hash, ledger block reference and verification status."
        testid="admin-reports-header"
      />
      {published.length === 0 ? (
        <EmptyState icon={FileText} title="No published results" description="Result certificates become available once an election's results are published." testid="admin-reports-empty" />
      ) : (
        <div className="flex flex-col gap-3">
          {published.map((e) => (
            <Card key={e.id} data-testid={`admin-report-row-${e.election_code}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-bold">{e.name}</p>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">{e.election_code}</p>
                  <p className="mt-1 text-xs text-slate-500">Published {fmtDateTime(e.results_published_at)}</p>
                </div>
                <Button onClick={() => download(e.id, e.election_code)} data-testid={`admin-report-download-${e.election_code}`}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Download certificate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
