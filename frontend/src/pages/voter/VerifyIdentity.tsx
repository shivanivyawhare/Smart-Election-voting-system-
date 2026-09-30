import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Fingerprint, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { AuthMe, IdentityInitiateOut, Voter } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";

type Step = "CONSENT" | "REFERENCE" | "OTP" | "DONE";

function detail(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const d = (error.body as { detail?: string }).detail;
    if (typeof d === "string") return d;
  }
  return "Identity verification could not be completed. Please retry.";
}

export default function VerifyIdentity() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: () => apiGet<AuthMe>("/auth/me") });
  const voter = me.data?.user as Voter | undefined;
  const [step, setStep] = useState<Step>("CONSENT");
  const [consentId, setConsentId] = useState("");
  const [ref, setRef] = useState("123456789012");
  const [otp, setOtp] = useState("");
  const [txn, setTxn] = useState<IdentityInitiateOut | null>(null);

  const consent = useMutation({
    mutationFn: () => apiPost<{ consent_id: string }>("/identity/consent", { purpose: "voting" }),
    onSuccess: (data) => { setConsentId(data.consent_id); setStep("REFERENCE"); },
    onError: (e) => toast.error(detail(e)),
  });

  const initiate = useMutation({
    mutationFn: () =>
      apiPost<IdentityInitiateOut>("/identity/initiate", { consent_id: consentId, aadhaar_ref: ref }),
    onSuccess: (data) => { setTxn(data); setStep("OTP"); },
    onError: (e) => toast.error(detail(e)),
  });

  const verify = useMutation({
    mutationFn: () => apiPost("/identity/verify-otp", { transaction_id: txn!.transaction_id, otp }),
    onSuccess: () => {
      setStep("DONE");
      toast.success("Identity verified (sandbox)", { description: "Continue to face verification." });
    },
    onError: (e) => toast.error(detail(e)),
  });

  if (me.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (voter?.identity_verified) {
    return (
      <div data-testid="identity-already-verified">
        <PageHeader title="Identity verification" description="Your identity verification is already complete." />
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-heading font-bold text-emerald-800">Identity verified</p>
              <p className="text-sm text-slate-600">
                Provider: sandbox · Reference: {voter.identity_masked ?? "XXXX-XXXX-0000"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Link to="/voter/face-verification" data-testid="identity-next-face-link" className={cn(buttonVariants(), "mt-4")}>
            Continue to face verification <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
      </div>
    );
  }

  return (
    <div data-testid="identity-verification-page">
      <PageHeader
        title="Step 1 — Identity verification"
        description="Consent-first identity verification through the sandbox identity provider. The reference number you type is validated in memory and never stored."
      />

      <div className="mx-auto max-w-xl">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900" data-testid="identity-sandbox-banner">
          SANDBOX VERIFICATION — this flow is a development simulation, NOT a real UIDAI verification.
        </div>

        <Card>
          <CardContent className="py-6">
            {step === "CONSENT" && (
              <div className="flex flex-col gap-4" data-testid="identity-consent-step">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="identity-consent-checkbox"
                    checked={consent.isPending ? undefined : false}
                    onCheckedChange={(checked) => { if (checked) consent.mutate(); }}
                    data-testid="identity-consent-checkbox"
                  />
                  <Label htmlFor="identity-consent-checkbox" className="text-sm leading-relaxed font-normal">
                    I consent to a sandbox identity-verification transaction for the purpose of
                    voting. I understand the provider, timestamp, status and risk score of this
                    transaction are recorded, and that no raw Aadhaar number, OTP or biometric
                    data is ever stored.
                  </Label>
                </div>
                {consent.isPending && <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Recording consent" />}
              </div>
            )}

            {step === "REFERENCE" && (
              <div className="flex flex-col gap-4" data-testid="identity-reference-step">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="identity-ref-input">12-digit identity reference</Label>
                  <Input
                    id="identity-ref-input"
                    inputMode="numeric"
                    maxLength={12}
                    value={ref}
                    onChange={(e) => setRef(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    data-testid="identity-ref-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sandbox mode: any 12 digits work. The value is validated in memory and discarded — never stored.
                  </p>
                </div>
                <Button onClick={() => initiate.mutate()} disabled={ref.length !== 12 || initiate.isPending} data-testid="identity-initiate-button">
                  {initiate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Fingerprint className="h-4 w-4" aria-hidden="true" />}
                  Send verification code
                </Button>
              </div>
            )}

            {step === "OTP" && txn && (
              <div className="flex flex-col gap-4" data-testid="identity-otp-step">
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" data-testid="identity-sandbox-otp-box">
                  <p className="font-semibold text-sky-900">SANDBOX OTP (development only)</p>
                  <p className="mt-1 font-mono text-lg tracking-widest text-sky-800" data-testid="identity-sandbox-otp">{txn.sandbox_otp}</p>
                  <p className="mt-1 text-xs text-sky-700">{txn.sandbox_notice}</p>
                </div>
                <p className="text-sm text-slate-600">Code sent to masked reference <span className="font-mono font-semibold">{txn.masked_ref}</span> via the {txn.provider} provider.</p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="identity-otp-input">6-digit code</Label>
                  <Input
                    id="identity-otp-input"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="font-mono text-lg tracking-widest"
                    data-testid="identity-otp-input"
                  />
                </div>
                <Button onClick={() => verify.mutate()} disabled={otp.length !== 6 || verify.isPending} data-testid="identity-verify-otp-button">
                  {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
                  Verify code
                </Button>
              </div>
            )}

            {step === "DONE" && (
              <div className="flex flex-col items-center gap-4 py-4 text-center" data-testid="identity-done-step">
                <CheckCircle2 className={cn("h-12 w-12 text-emerald-600")} aria-hidden="true" />
                <div>
                  <p className="font-heading text-lg font-bold text-emerald-800">Identity verified (sandbox)</p>
                  <p className="text-sm text-slate-600">Recorded at {fmtDateTime(new Date().toISOString())}</p>
                </div>
                <Link to="/voter/face-verification" data-testid="identity-done-next-button" className={buttonVariants()}>
                    Continue to face verification <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
