import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import type { AuthMe } from "@/lib/types";
import { beginSession } from "@/lib/session";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MfaChallenge {
  mfa_required: boolean;
  mfa_token: string;
  sandbox_code: string | null;
}

function detail(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const d = (error.body as { detail?: string }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);

  const step1 = useMutation({
    mutationFn: () => apiPost<MfaChallenge>("/auth/admin/login", { email, password }),
    onSuccess: (data) => {
      setChallenge(data);
      toast.info("MFA required", { description: "Enter the 6-digit authenticator code." });
    },
    onError: (e) => toast.error(detail(e, "Sign-in failed. Check your credentials.")),
  });

  const step2 = useMutation({
    mutationFn: () => apiPost<AuthMe>("/auth/admin/mfa", { mfa_token: challenge!.mfa_token, code }),
    onSuccess: async () => {
      await beginSession();
      toast.success("Signed in", { description: "MFA verified." });
      navigate("/admin/dashboard");
    },
    onError: (e) => toast.error(detail(e, "MFA verification failed.")),
  });

  return (
    <AuthCard
      title={challenge ? "Multi-factor authentication" : "Administrator sign in"}
      subtitle={challenge
        ? "Enter the 6-digit code to complete sign-in. Five incorrect codes lock the account."
        : "Password plus mandatory MFA. Access is scoped by role permissions."}
      testid="admin-login-page"
    >
      {!challenge ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); step1.mutate(); }}
          data-testid="admin-login-form"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-login-email">Email</Label>
            <Input
              id="admin-login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              data-testid="admin-login-email-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-login-password">Password</Label>
            <Input
              id="admin-login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              data-testid="admin-login-password-input"
            />
          </div>
          <Button type="submit" disabled={!email || !password || step1.isPending} data-testid="admin-login-submit-button">
            {step1.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            Continue to MFA
          </Button>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">DEMO CREDENTIALS (DEVELOPMENT ONLY)</p>
            <p className="mt-1 font-mono">admin@example.com / Admin@123 (SUPER_ADMIN)</p>
            <p className="font-mono">results.officer@example.com / Results@123</p>
            <p className="font-mono">security.officer@example.com / Security@123</p>
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); step2.mutate(); }}
          data-testid="admin-mfa-form"
        >
          {challenge.sandbox_code && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm" data-testid="admin-sandbox-mfa-box">
              <p className="font-semibold text-sky-900">SANDBOX MFA CODE (development only)</p>
              <p className="mt-1 font-mono text-lg tracking-widest text-sky-800" data-testid="admin-sandbox-mfa-code">
                {challenge.sandbox_code}
              </p>
              <p className="mt-1 text-xs text-sky-700">
                In production this code is delivered by the configured authenticator/notification provider.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="admin-mfa-code">6-digit code</Label>
            <Input
              id="admin-mfa-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="font-mono text-lg tracking-widest"
              data-testid="admin-mfa-code-input"
            />
          </div>
          <Button type="submit" disabled={code.length !== 6 || step2.isPending} data-testid="admin-mfa-submit-button">
            {step2.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
            Verify & sign in
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setChallenge(null); setCode(""); }} data-testid="admin-mfa-back-button">
            Use a different account
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
