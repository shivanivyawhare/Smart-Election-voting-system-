import { useQuery } from "@tanstack/react-query";
import { Boxes, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Block, ChainVerification } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { HashText } from "@/components/HashText";
import { PageHeader } from "@/components/PageHeader";

export default function Blockchain() {
  const blocksQ = useQuery({
    queryKey: ["admin", "blocks"],
    queryFn: () => apiGet<{ total: number; blocks: Block[]; latest: Block | null }>("/blockchain/blocks?limit=100"),
    retry: false,
  });
  const verifyQ = useQuery({
    queryKey: ["admin", "chain-verify"],
    queryFn: () => apiGet<ChainVerification>("/blockchain/verify"),
    enabled: false,
    retry: false,
  });

  if (blocksQ.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (blocksQ.isError || !blocksQ.data) return <EmptyState icon={Boxes} title="Ledger unavailable" description="The ledger could not be read." testid="blockchain-error" />;

  const { total, blocks, latest } = blocksQ.data;

  return (
    <div data-testid="blockchain-page">
      <PageHeader
        title="Blockchain Explorer"
        description="Local permissioned, append-only hash-chained ledger. Only integrity metadata is anchored — never personal data or vote choices."
        testid="blockchain-header"
        actions={
          <Button onClick={() => verifyQ.refetch()} disabled={verifyQ.isFetching} data-testid="blockchain-verify-btn">
            {verifyQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Verify Election Integrity
          </Button>
        }
      />

      {verifyQ.data && (
        <Card className={`mb-6 ${verifyQ.data.valid ? "border-emerald-300" : "border-red-300"}`} data-testid="blockchain-verify-result">
          <CardContent className="flex flex-wrap items-center gap-3 py-5">
            {verifyQ.data.valid ? <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" /> : <XCircle className="h-8 w-8 text-red-600" aria-hidden="true" />}
            <div>
              <p className={`font-heading text-lg font-bold ${verifyQ.data.valid ? "text-emerald-800" : "text-red-800"}`} data-testid="blockchain-verify-status">
                {verifyQ.data.status}
              </p>
              <p className="text-xs text-slate-600">
                {verifyQ.data.blocks_checked} blocks recomputed and linked · checked {fmtDateTime(verifyQ.data.checked_at)}
                {verifyQ.data.first_invalid_index != null && ` · first invalid block #${verifyQ.data.first_invalid_index}`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Boxes} label="Total blocks" value={total} tone="navy" testid="blockchain-total-blocks" />
        <StatCard icon={Boxes} label="Latest index" value={latest?.index ?? 0} testid="blockchain-latest-index" />
        <StatCard icon={Boxes} label="Latest event" value={latest?.event_type ?? "—"} testid="blockchain-latest-event" />
      </div>

      {latest && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="font-heading text-lg">Latest block</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Index</dt><dd className="font-mono text-sm" data-testid="latest-block-index">#{latest.index}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Event</dt><dd className="text-sm font-semibold">{latest.event_type}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Current hash</dt><dd><HashText hash={latest.current_hash} testid="latest-block-hash" /></dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Previous hash</dt><dd><HashText hash={latest.previous_hash} testid="latest-block-prev-hash" /></dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Timestamp</dt><dd className="font-mono text-sm">{fmtDateTime(latest.timestamp)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-slate-500">Record hash</dt><dd><HashText hash={latest.record_hash} testid="latest-block-record-hash" /></dd></div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader><CardTitle className="font-heading text-lg">Block chain</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="blockchain-blocks-table">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Event type</th>
                <th className="py-2 pr-3">Record hash</th>
                <th className="py-2 pr-3">Previous hash</th>
                <th className="py-2 pr-3">Current hash</th>
                <th className="py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.current_hash} className="border-b border-slate-100" data-testid={`block-row-${b.index}`}>
                  <td className="py-2.5 pr-3 font-mono text-xs">{b.index}</td>
                  <td className="py-2.5 pr-3 font-semibold text-xs">{b.event_type}</td>
                  <td className="py-2.5 pr-3"><HashText hash={b.record_hash} head={6} tail={4} /></td>
                  <td className="py-2.5 pr-3"><HashText hash={b.previous_hash} head={6} tail={4} /></td>
                  <td className="py-2.5 pr-3"><HashText hash={b.current_hash} head={6} tail={4} /></td>
                  <td className="py-2.5 text-xs text-slate-500">{fmtDateTime(b.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
