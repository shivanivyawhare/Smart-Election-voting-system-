import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Admin, Election } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { can } from "@/lib/permissions";
import { useAuthMe } from "@/hooks/useAuthMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

function detail(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const d = (error.body as { detail?: string }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function AdminResults() {
  const { data: auth } = useAuthMe();
  const role = (auth?.user as Admin | undefined)?.role;
  const q = useQuery({ queryKey: ["admin", "elections"], queryFn: () => apiGet<Election[]>("/admin/elections"), retry: false });

  const generate = useMutation({
    mutationFn: (id: string) => apiPost<{ snapshot_hash: string; valid_votes: number }>(`/results/${id}/generate`),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Count generated", { description: `${res.valid_votes} valid votes · hash ${res.snapshot_hash.slice(0, 12)}…` });
    },
    onError: (e) => toast.error(detail(e, "Counting could not be started.")),
  });

  const publish = useMutation({
    mutationFn: (id: string) => apiPost(`/results/${id}/publish`, { confirm: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Results published", { description: "The public results portal now shows this election." });
    },
    onError: (e) => toast.error(detail(e, "Results could not be published.")),
  });

  async function downloadCertificate(id: string, code: string) {
    const res = await fetch(`/api/admin/results/${id}/certificate`);
    if (!res.ok) { toast.error("The certificate could not be generated."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `result-certificate-${code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Certificate downloaded");
  }

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (q.isError) return <EmptyState icon={BarChart3} title="Results unavailable" description="Elections could not be loaded." testid="admin-results-error" />;

  const elections = q.data ?? [];

  return (
    <div data-testid="admin-results-page">
      <PageHeader
        title="Counting & Results"
        description="Counts derive exclusively from encrypted ballots — no endpoint can edit a vote total. Publication is a separate, permission-gated step."
        testid="admin-results-header"
      />

      <div className="flex flex-col gap-4">
        {elections.map((e) => (
          <Card key={e.id} data-testid={`admin-results-row-${e.election_code}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-heading font-bold text-slate-900">{e.name}</p>
                  <StatusBadge status={e.status} testid={`admin-results-status-${e.election_code}`} />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{e.election_code} · {e.votes_cast ?? 0} votes cast</p>
                {e.results_published_at && (
                  <p className="mt-1 text-xs text-emerald-700">Published {fmtDateTime(e.results_published_at)}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {["CLOSED", "COUNTING"].includes(e.status) && can(role, "result:generate") && (
                  <ConfirmDialog
                    triggerLabel={e.status === "CLOSED" ? "Start counting" : "Recount"}
                    title="Run the counting service?"
                    description="Ballots will be decrypted, validated and tallied. A hashed result snapshot is created and anchored into the ledger. Totals cannot be edited by hand."
                    confirmLabel="Run count"
                    destructive={false}
                    testid={`admin-results-generate-${e.election_code}`}
                    onConfirm={() => generate.mutateAsync(e.id)}
                  />
                )}
                {e.status === "COUNTING" && can(role, "result:publish") && (
                  <ConfirmDialog
                    triggerLabel="Publish results"
                    title="Publish these results publicly?"
                    description="Publishing makes the result snapshot visible on the public results portal and anchors the publication event into the ledger. This cannot be undone."
                    confirmLabel="Publish results"
                    testid={`admin-results-publish-${e.election_code}`}
                    onConfirm={() => publish.mutateAsync(e.id)}
                  />
                )}
                {e.status === "RESULTS_PUBLISHED" && can(role, "report:view") && (
                  <Button size="sm" variant="outline" onClick={() => downloadCertificate(e.id, e.election_code)} data-testid={`admin-results-certificate-${e.election_code}`}>
                    <Download className="h-4 w-4" aria-hidden="true" /> Result certificate (PDF)
                  </Button>
                )}
                {e.status === "RESULTS_PUBLISHED" && (
                  <a href={`/results`} className="text-sm font-semibold text-[#1D4ED8] hover:underline" data-testid={`admin-results-public-link-${e.election_code}`}>
                    View public page →
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {elections.length === 0 && <EmptyState icon={BarChart3} title="No elections" description="Create and close an election to run counting." testid="admin-results-empty" />}
      </div>
    </div>
  );
}
