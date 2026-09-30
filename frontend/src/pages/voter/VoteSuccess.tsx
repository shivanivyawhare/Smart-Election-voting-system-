import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Receipt } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HashText } from "@/components/HashText";

export default function VoteSuccess() {
  const [params] = useSearchParams();
  const receiptId = params.get("receipt") ?? "";
  const q = useQuery({
    queryKey: ["voter", "receipt", receiptId],
    queryFn: () => apiGet<Receipt>(`/voting/receipt/${receiptId}`),
    enabled: !!receiptId,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-xl" data-testid="vote-success-page">
      <Card className="border-emerald-200">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-600" aria-hidden="true" />
          <div>
            <h1 className="font-heading text-2xl font-bold text-emerald-900" data-testid="vote-success-heading">
              Your vote has been recorded
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Your ballot was encrypted and its integrity hash committed to the ledger. The
              receipt below proves inclusion — it never reveals your candidate choice.
            </p>
          </div>

          {q.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {q.data && (
            <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left" data-testid="vote-success-receipt">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vote receipt</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900" data-testid="vote-success-receipt-id">
                {q.data.receipt_id}
              </p>
              <dl className="mt-3 grid gap-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Ballot commitment</dt>
                  <dd><HashText hash={q.data.commitment} testid="vote-success-commitment" /></dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Ledger block</dt>
                  <dd className="font-mono" data-testid="vote-success-block">#{q.data.block_index ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Recorded at</dt>
                  <dd className="font-mono">{fmtDateTime(q.data.created_at)}</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <Link to={`/voter/vote-verification?receipt=${receiptId}`} className={cn(buttonVariants())} data-testid="vote-success-verify-button">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Verify my ballot
            </Link>
            <Link to="/voter/receipt" className={cn(buttonVariants({ variant: "outline" }))} data-testid="vote-success-receipts-button">
              <ReceiptText className="h-4 w-4" aria-hidden="true" /> All receipts
            </Link>
            <Link to="/voter/dashboard" className={cn(buttonVariants({ variant: "ghost" }))} data-testid="vote-success-dashboard-button">
              Back to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
