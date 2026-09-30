import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ReceiptText } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Receipt } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { HashText } from "@/components/HashText";
import { PageHeader } from "@/components/PageHeader";

export default function Receipts() {
  const q = useQuery({
    queryKey: ["voter", "receipts"],
    queryFn: () => apiGet<Receipt[]>("/voting/receipts"),
    retry: false,
  });

  return (
    <div data-testid="voter-receipts-page">
      <PageHeader
        title="Your vote receipts"
        description="One receipt per ballot cast. A receipt proves inclusion in the ledger and never reveals a candidate choice."
        testid="voter-receipts-header"
      />

      {q.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {(q.isError || (q.data && q.data.length === 0)) && (
        <EmptyState
          icon={ReceiptText}
          title={q.isError ? "Receipts unavailable" : "No ballots cast yet"}
          description={q.isError ? "Your receipts could not be loaded. Please retry shortly." : "After you vote, your receipt appears here with its ledger block reference."}
          testid="voter-receipts-empty"
        />
      )}

      <div className="flex flex-col gap-3">
        {(q.data ?? []).map((r) => (
          <Card key={r.receipt_id} data-testid={`receipt-card-${r.receipt_id}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div>
                <p className="font-mono text-base font-bold text-slate-900">{r.receipt_id}</p>
                <p className="mt-1 text-xs text-slate-500">Recorded {fmtDateTime(r.created_at)}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Commitment</span>
                  <HashText hash={r.commitment} testid={`receipt-commitment-${r.receipt_id}`} />
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm text-slate-700">block #{r.block_index ?? "—"}</p>
                <Link
                  to={`/voter/vote-verification?receipt=${r.receipt_id}`}
                  className="mt-1 inline-block text-xs font-semibold text-[#1D4ED8] hover:underline"
                  data-testid={`receipt-verify-link-${r.receipt_id}`}
                >
                  Verify this ballot →
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
