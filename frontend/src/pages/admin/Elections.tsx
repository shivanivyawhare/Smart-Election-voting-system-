import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Vote } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { Constituency, Election } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { can } from "@/lib/permissions";
import { useAuthMe } from "@/hooks/useAuthMe";
import type { Admin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

const NEXT_ACTIONS: Record<string, { target: string; label: string; description: string }[]> = {
  DRAFT: [{ target: "SCHEDULED", label: "Schedule election", description: "Move this election from DRAFT to SCHEDULED. Configuration stays editable until it opens." }],
  SCHEDULED: [{ target: "OPEN", label: "Open voting", description: "Opening the election starts accepting ballots and freezes its configuration. This is audited and anchored to the ledger." }],
  OPEN: [
    { target: "PAUSED", label: "Pause voting", description: "Pausing temporarily stops accepting ballots. Already-cast votes are unaffected." },
    { target: "CLOSED", label: "Close voting", description: "Closing permanently stops accepting ballots for this election. This cannot be undone." },
  ],
  PAUSED: [
    { target: "OPEN", label: "Resume voting", description: "Resume accepting ballots for this election." },
    { target: "CLOSED", label: "Close voting", description: "Closing permanently stops accepting ballots. This cannot be undone." },
  ],
  CLOSED: [{ target: "COUNTING", label: "Start counting", description: "Begin the counting workflow. Ballots are decrypted, validated and tallied; no count can be edited by hand." }],
  RESULTS_PUBLISHED: [{ target: "ARCHIVED", label: "Archive election", description: "Archive this completed election. Records and the ledger remain intact." }],
};

export default function AdminElections() {
  const { data: auth } = useAuthMe();
  const role = (auth?.user as Admin | undefined)?.role;
  const [createOpen, setCreateOpen] = useState(false);

  const electionsQ = useQuery({
    queryKey: ["admin", "elections"],
    queryFn: () => apiGet<Election[]>("/admin/elections"),
    retry: false,
  });
  const constituenciesQ = useQuery({
    queryKey: ["public", "constituencies"],
    queryFn: () => apiGet<Constituency[]>("/constituencies"),
    retry: false,
  });

  const transition = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      apiPost(`/admin/elections/${vars.id}/transition`, { status: vars.status }),
    onSuccess: async (_d, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`Election moved to ${vars.status}`);
    },
    onError: (e) => toast.error(detail(e, "The state change was rejected.")),
  });

  const [form, setForm] = useState({
    name: "", election_code: "", description: "", election_type: "GENERAL",
    start_at: "", end_at: "", constituency_ids: [] as string[],
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<Election>("/admin/elections", {
        ...form,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "elections"] });
      toast.success("Election created as DRAFT");
      setCreateOpen(false);
      setForm({ name: "", election_code: "", description: "", election_type: "GENERAL", start_at: "", end_at: "", constituency_ids: [] });
    },
    onError: (e) => toast.error(detail(e, "The election could not be created.")),
  });

  const elections = electionsQ.data ?? [];

  return (
    <div data-testid="admin-elections-page">
      <PageHeader
        title="Elections"
        description="Create elections and drive the lifecycle. Invalid transitions are rejected server-side; every change is audited and anchored."
        testid="admin-elections-header"
        actions={
          can(role, "election:create") ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger render={<Button data-testid="admin-create-election-button" />}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Create election
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="admin-create-election-dialog">
                <DialogHeader><DialogTitle className="font-heading text-lg font-bold">Create election</DialogTitle></DialogHeader>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
                  data-testid="admin-create-election-form"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="election-name">Election name</Label>
                    <Input id="election-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="election-name-input" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="election-code">Election ID / code</Label>
                    <Input id="election-code" value={form.election_code} onChange={(e) => setForm({ ...form, election_code: e.target.value })} placeholder="GE-2026-002" data-testid="election-code-input" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="election-description">Description</Label>
                    <Textarea id="election-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="election-description-input" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="election-start">Start date & time</Label>
                      <Input id="election-start" type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} data-testid="election-start-input" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="election-end">End date & time</Label>
                      <Input id="election-end" type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} data-testid="election-end-input" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Constituencies</Label>
                    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3" data-testid="election-constituencies-list">
                      {(constituenciesQ.data ?? []).map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.constituency_ids.includes(c.id)}
                            onCheckedChange={(checked) =>
                              setForm((prev) => ({
                                ...prev,
                                constituency_ids: checked
                                  ? [...prev.constituency_ids, c.id]
                                  : prev.constituency_ids.filter((x) => x !== c.id),
                              }))
                            }
                            data-testid={`election-constituency-${c.code}`}
                          />
                          {c.name} ({c.code})
                        </label>
                      ))}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button
                      type="submit"
                      disabled={create.isPending || !form.name || !form.election_code || !form.start_at || !form.end_at || form.constituency_ids.length === 0}
                      data-testid="election-create-submit-button"
                    >
                      {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Create as DRAFT
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {electionsQ.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {electionsQ.isError && (
        <EmptyState icon={Vote} title="Elections unavailable" description="The election list could not be loaded. Retry shortly." testid="admin-elections-error" />
      )}
      {!electionsQ.isLoading && elections.length === 0 && !electionsQ.isError && (
        <EmptyState icon={Vote} title="No elections yet" description="Create your first election to begin." testid="admin-elections-empty" />
      )}

      <div className="flex flex-col gap-4">
        {elections.map((e) => (
          <Card key={e.id} data-testid={`admin-election-row-${e.election_code}`}>
            <CardContent className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/elections/${e.id}`} className="font-heading text-lg font-bold text-slate-900 hover:underline" data-testid={`admin-election-link-${e.election_code}`}>
                      {e.name}
                    </Link>
                    <StatusBadge status={e.status} testid={`admin-election-status-${e.election_code}`} />
                    {e.auto_closed && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">AUTO-CLOSED</span>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">{e.election_code} · {e.election_type}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {fmtDateTime(e.start_at)} → {fmtDateTime(e.end_at)} · {e.candidate_count ?? 0} candidates · {e.votes_cast ?? 0} votes cast
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(NEXT_ACTIONS[e.status] ?? []).map((action) => (
                    <ConfirmDialog
                      key={action.target}
                      triggerLabel={action.label}
                      triggerVariant={action.target === "CLOSED" ? "destructive" : "default"}
                      title={`${action.label}?`}
                      description={action.description}
                      confirmLabel={action.label}
                      destructive={action.target === "CLOSED"}
                      testid={`election-transition-${e.election_code}-${action.target.toLowerCase()}`}
                      onConfirm={() => transition.mutateAsync({ id: e.id, status: action.target })}
                    />
                  ))}
                  <Link to={`/admin/elections/${e.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} data-testid={`admin-election-manage-${e.election_code}`}>
                    Manage
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
