import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { apiPost, ApiError } from "@/lib/api";
import type { AuthMe } from "@/lib/types";
import { beginSession } from "@/lib/session";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

function errorDetail(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const detail = (error.body as { detail?: string }).detail;
    if (typeof detail === "string") return detail;
  }
  return "Sign-in failed. Please try again.";
}

export default function VoterLogin() {
  const navigate = useNavigate();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => apiPost<AuthMe>("/auth/login", values),
    onSuccess: async () => {
      await beginSession();
      toast.success("Signed in", { description: "Welcome back to the voter portal." });
      navigate("/voter/dashboard");
    },
    onError: (error) => toast.error(errorDetail(error), {
      description: error instanceof ApiError && error.status === 429 ? "Rate limit: wait a few minutes." : undefined,
    }),
  });

  return (
    <AuthCard
      title="Voter sign in"
      subtitle="Access your verification steps, elections and receipts."
      testid="voter-login-page"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
        data-testid="voter-login-form"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="voter-login-email">Email</Label>
          <Input
            id="voter-login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.dev"
            {...form.register("email")}
            data-testid="voter-login-email-input"
          />
          {form.formState.errors.email && (
            <p className="text-xs font-medium text-destructive" role="alert">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="voter-login-password">Password</Label>
          <Input
            id="voter-login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            {...form.register("password")}
            data-testid="voter-login-password-input"
          />
          {form.formState.errors.password && (
            <p className="text-xs font-medium text-destructive" role="alert">{form.formState.errors.password.message}</p>
          )}
        </div>
        <Button type="submit" disabled={mutation.isPending} data-testid="voter-login-submit-button">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          Sign in
        </Button>
      </form>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold">DEMO CREDENTIALS (DEVELOPMENT ONLY)</p>
        <p className="mt-1 font-mono">voter01@example.dev / Voter@123</p>
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link to="/voter/register" className="font-semibold text-[#1D4ED8] hover:underline" data-testid="voter-login-register-link">
          Register as a voter
        </Link>
      </p>
    </AuthCard>
  );
}
