import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { ReceiptVerification } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HashText } from "@/components/HashText";
import { PageHeader } from "@/components/PageHeader";

export default function VoteVerification() {
  const [params] = useSearchParams();
  const [receiptId, setReceiptId] = useState(params.get("receipt") ?? "");
  const [notFound, setNotFound] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: (id: string) => apiGet<ReceiptVerification>(`/voting/verify/${id.trim()}`),
    onMutate: () => setNotFound(null),
    onError: (error) => {
      const d = error instanceof ApiError && error.body && typeof error.body === "object"
        ? (error.body as { detail?: string }).detail
        : undefined;
      setNotFound(typeof d === "string" ? d : "This receipt could not be verified.");
    },
  });

  useEffect(() => {
    const preset = params.get("receipt");
    if (preset) verify.mutate(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = verify.data;

  return (
    <div data-testid="vote-verification-page">
      <PageHeader
        title="Verify a ballot record"
        description="Enter a receipt ID to confirm your ballot was recorded and anchored in the ledger. The candidate choice is never disclosed."
        testid="vote-verification-header"
      />

      <div className="mx-auto max-w-xl">
        <Card>
          <CardContent className="py-6">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => { e.preventDefault(); if (receiptId.trim()) verify.mutate(receiptId); }}
              data-testid="vote-verification-form"
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="verification-receipt-input">Receipt ID</Label>
                <Input
                  id="verification-receipt-input"
                  value={receiptId}
                  onChange={(e) => setReceiptId(e.target.value)}
                  placeholder="RCPT-XXXXXXXXXXXX"
                  className="font-mono"
                  data-testid="vote-verification-receipt-input"
                />
              </div>
              <Button type="submit" disabled={!receiptId.trim() || verify.isPending} data-testid="vote-verification-submit-button">
                {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                Verify
              </Button>
            </form>

            {notFound && (
              <div className="mt-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4" data-testid="vote-verification-not-found">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <p className="font-heading font-bold text-red-800">NOT VERIFIED</p>
                  <p className="text-sm text-red-700">{notFound}</p>
                </div>
              </div>
            )}

            {result && (
              <div
                className={`mt-5 rounded-lg border p-4 ${result.status.includes("VERIFIED") ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
                data-testid="vote-verification-result"
              >
                <div className="flex items-center gap-3">
                  {result.status.includes("VERIFIED") ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
                  )}
                  <p
                    className={`font-heading font-bold ${result.status.includes("VERIFIED") ? "text-emerald-800" : "text-red-800"}`}
                    data-testid="vote-verification-status"
                  >
                    {result.status}
                  </p>
                </div>
                {result.detail && <p className="mt-2 text-sm text-slate-700">{result.detail}</p>}
                {result.commitment && (
                  <dl className="mt-3 grid gap-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Receipt</dt>
                      <dd className="font-mono font-semibold">{result.receipt_id}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Ballot commitment</dt>
                      <dd><HashText hash={result.commitment} testid="verification-commitment" /></dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Ledger block</dt>
                      <dd className="font-mono">#{result.block_index}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Block hash</dt>
                      <dd><HashText hash={result.block_hash} testid="verification-block-hash" /></dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Recorded at</dt>
                      <dd className="font-mono">{fmtDateTime(result.recorded_at)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Chain status</dt>
                      <dd className="font-semibold">{result.chain_valid ? "CHAIN VALID" : "CHAIN INVALID"}</dd>
                    </div>
                  </dl>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  No candidate information is included in this response — by design.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
