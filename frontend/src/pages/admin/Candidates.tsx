import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, UserCog } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api";
import type { Admin, Candidate, Constituency, Election } from "@/lib/types";
import { queryClient } from "@/lib/queryClient";
import { can } from "@/lib/permissions";
import { useAuthMe } from "@/hooks/useAuthMe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default function AdminCandidates() {
  const { data: auth } = useAuthMe();
  const role = (auth?.user as Admin | undefined)?.role;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ election_id: "", constituency_id: "", name: "", party: "", symbol: "", description: "" });

  const electionsQ = useQuery({ queryKey: ["admin", "elections"], queryFn: () => apiGet<Election[]>("/admin/elections"), retry: false });
  const constituenciesQ = useQuery({ queryKey: ["public", "constituencies"], queryFn: () => apiGet<Constituency[]>("/constituencies") });
  const candidatesQ = useQuery({ queryKey: ["admin", "candidates"], queryFn: () => apiGet<Candidate[]>("/admin/candidates"), retry: false });

  const create = useMutation({
    mutationFn: () => apiPost<Candidate>("/admin/candidates", form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
      toast.success("Candidate added");
      setOpen(false);
      setForm({ election_id: "", constituency_id: "", name: "", party: "", symbol: "", description: "" });
    },
    onError: (e) => toast.error(detail(e, "The candidate could not be added.")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean; deactivated: boolean; detail?: string }>(`/admin/candidates/${id}`),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
      toast.success(res.deactivated ? "Candidate deactivated" : "Candidate deleted", { description: res.detail });
    },
    onError: (e) => toast.error(detail(e, "The candidate could not be removed.")),
  });

  const elections = electionsQ.data ?? [];
  const selectedElection = elections.find((e) => e.id === form.election_id);
  const availableConstituencies = (constituenciesQ.data ?? []).filter(
    (c) => !selectedElection || selectedElection.constituency_ids.includes(c.id),
  );

  return (
    <div data-testid="admin-candidates-page">
      <PageHeader
        title="Candidates"
        description="Manage candidate rosters per election and constituency. Duplicates are rejected; candidates with existing votes are deactivated rather than deleted."
        testid="admin-candidates-header"
        actions={
          can(role, "candidate:create") ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button data-testid="admin-add-candidate-button" />}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add candidate
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="admin-add-candidate-dialog">
                <DialogHeader><DialogTitle className="font-heading text-lg font-bold">Add candidate</DialogTitle></DialogHeader>
                <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }} data-testid="admin-add-candidate-form">
                  <div className="flex flex-col gap-1.5">
                    <Label>Election</Label>
                    <Select value={form.election_id} onValueChange={(v: string) => setForm({ ...form, election_id: v, constituency_id: "" })}>
                      <SelectTrigger data-testid="candidate-election-select"><SelectValue placeholder="Select election" /></SelectTrigger>
                      <SelectContent>
                        {elections.filter((e) => !["CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"].includes(e.status)).map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name} ({e.status})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Constituency</Label>
                    <Select value={form.constituency_id} onValueChange={(v: string) => setForm({ ...form, constituency_id: v })}>
                      <SelectTrigger data-testid="candidate-constituency-select"><SelectValue placeholder="Select constituency" /></SelectTrigger>
                      <SelectContent>
                        {availableConstituencies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="candidate-name">Name</Label>
                    <Input id="candidate-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="candidate-name-input" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="candidate-party">Party / Independent</Label>
                      <Input id="candidate-party" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} data-testid="candidate-party-input" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="candidate-symbol">Symbol (max 8 chars)</Label>
                      <Input id="candidate-symbol" maxLength={8} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} data-testid="candidate-symbol-input" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="candidate-description">Biography / manifesto</Label>
                    <Textarea id="candidate-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="candidate-description-input" />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={create.isPending || !form.election_id || !form.constituency_id || !form.name || !form.party || !form.symbol} data-testid="candidate-create-submit-button">
                      {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Add candidate
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {candidatesQ.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {candidatesQ.isError && <EmptyState icon={UserCog} title="Candidates unavailable" description="The candidate list could not be loaded." testid="admin-candidates-error" />}
      {candidatesQ.data?.length === 0 && <EmptyState icon={UserCog} title="No candidates yet" description="Add candidates to an election to build its ballot." testid="admin-candidates-empty" />}

      {!!candidatesQ.data?.length && (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm" data-testid="admin-candidates-table">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Candidate</th>
                  <th className="py-2 pr-4">Party</th>
                  <th className="py-2 pr-4">Constituency</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidatesQ.data.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100" data-testid={`admin-candidate-row-${c.id}`}>
                    <td className="py-3 pr-4">
                      <span className="flex h-8 w-8 items-center justify-center rounded bg-[#0B192C] font-mono text-[10px] font-bold text-white">{c.symbol}</span>
                    </td>
                    <td className="py-3 pr-4 font-semibold">{c.name}</td>
                    <td className="py-3 pr-4 text-slate-600">{c.party}</td>
                    <td className="py-3 pr-4 text-slate-600">{c.constituency_name ?? "—"}</td>
                    <td className="py-3 pr-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3">
                      {can(role, "candidate:delete") && (
                        <ConfirmDialog
                          triggerLabel="Delete"
                          triggerVariant="destructive"
                          triggerSize="xs"
                          title="Delete this candidate?"
                          description={`${c.name} will be removed from the ballot. If votes already exist for this election, the candidate is deactivated instead so counted ballots remain valid.`}
                          confirmLabel="Delete candidate"
                          testid={`admin-candidate-delete-${c.id}`}
                          onConfirm={() => remove.mutateAsync(c.id)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
