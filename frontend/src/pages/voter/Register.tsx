import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { AuthMe } from "@/lib/types";
import { beginSession } from "@/lib/session";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PublicConstituency {
  id: string;
  code: string;
  name: string;
  state: string;
  district: string;
}

const schema = z
  .object({
    full_name: z.string().min(3, "Enter your full name").max(120),
    date_of_birth: z.string().min(10, "Enter your date of birth"),
    mobile: z.string().regex(/^[0-9]{10}$/, "Enter a 10-digit mobile number"),
    email: z.string().email("Enter a valid email address"),
    state: z.string().min(2, "Enter your state").max(60),
    district: z.string().min(2, "Enter your district").max(60),
    constituency_id: z.string().min(1, "Select your constituency"),
    voter_ref: z.string().min(6, "Enter your electoral-roll reference").max(24),
    password: z.string().min(8, "At least 8 characters").max(128),
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof schema>;

export default function VoterRegister() {
  const navigate = useNavigate();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "", date_of_birth: "", mobile: "", email: "", state: "", district: "",
      constituency_id: "", voter_ref: "", password: "", confirm_password: "",
    },
  });
  const constituencies = useQuery({
    queryKey: ["public", "constituencies"],
    queryFn: () => apiGet<PublicConstituency[]>("/constituencies"),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiPost<AuthMe>("/auth/register", {
        ...values,
        confirm_password: undefined,
      }),
    onSuccess: async () => {
      await beginSession();
      toast.success("Registration received", {
        description: "An administrator will approve your registration. Complete verification while you wait.",
      });
      navigate("/voter/dashboard");
    },
    onError: (error) => {
      const detail = error instanceof ApiError && error.body && typeof error.body === "object"
        ? (error.body as { detail?: string }).detail
        : undefined;
      toast.error(typeof detail === "string" ? detail : "Registration failed. Please review the form and retry.");
    },
  });

  const err = form.formState.errors;

  return (
    <AuthCard
      title="Voter registration"
      subtitle="Your electoral-roll reference is used for the roll check — no Aadhaar number is requested or stored."
      testid="voter-register-page"
      width="max-w-2xl"
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values))}
        data-testid="voter-register-form"
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="register-full-name">Full name</Label>
          <Input id="register-full-name" placeholder="Full name" {...form.register("full_name")} data-testid="register-name-input" />
          {err.full_name && <p className="text-xs font-medium text-destructive" role="alert">{err.full_name.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-dob">Date of birth</Label>
          <Input id="register-dob" type="date" {...form.register("date_of_birth")} data-testid="register-dob-input" />
          {err.date_of_birth && <p className="text-xs font-medium text-destructive" role="alert">{err.date_of_birth.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-mobile">Mobile number</Label>
          <Input id="register-mobile" inputMode="numeric" placeholder="10-digit mobile" {...form.register("mobile")} data-testid="register-mobile-input" />
          {err.mobile && <p className="text-xs font-medium text-destructive" role="alert">{err.mobile.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="register-email">Email</Label>
          <Input id="register-email" type="email" placeholder="you@example.dev" {...form.register("email")} data-testid="register-email-input" />
          {err.email && <p className="text-xs font-medium text-destructive" role="alert">{err.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-state">State</Label>
          <Input id="register-state" placeholder="State" {...form.register("state")} data-testid="register-state-input" />
          {err.state && <p className="text-xs font-medium text-destructive" role="alert">{err.state.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-district">District</Label>
          <Input id="register-district" placeholder="District" {...form.register("district")} data-testid="register-district-input" />
          {err.district && <p className="text-xs font-medium text-destructive" role="alert">{err.district.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="register-constituency">Constituency</Label>
          <Select
            value={form.watch("constituency_id")}
            onValueChange={(v: string) => form.setValue("constituency_id", v, { shouldValidate: true })}
          >
            <SelectTrigger id="register-constituency" data-testid="register-constituency-select">
              <SelectValue placeholder={constituencies.isLoading ? "Loading constituencies…" : "Select your constituency"} />
            </SelectTrigger>
            <SelectContent>
              {(constituencies.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.code}) — {c.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err.constituency_id && <p className="text-xs font-medium text-destructive" role="alert">{err.constituency_id.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-voter-ref">Voter reference (electoral roll)</Label>
          <Input id="register-voter-ref" placeholder="e.g. VR123456" {...form.register("voter_ref")} data-testid="register-voter-ref-input" />
          {err.voter_ref && <p className="text-xs font-medium text-destructive" role="alert">{err.voter_ref.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <Input id="register-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...form.register("password")} data-testid="register-password-input" />
          {err.password && <p className="text-xs font-medium text-destructive" role="alert">{err.password.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="register-confirm-password">Confirm password</Label>
          <Input id="register-confirm-password" type="password" autoComplete="new-password" placeholder="Repeat password" {...form.register("confirm_password")} data-testid="register-confirm-password-input" />
          {err.confirm_password && <p className="text-xs font-medium text-destructive" role="alert">{err.confirm_password.message}</p>}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mutation.isPending} className="w-full" data-testid="register-submit-button">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            Create voter account
          </Button>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link to="/voter/login" className="font-semibold text-[#1D4ED8] hover:underline" data-testid="register-login-link">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </AuthCard>
  );
}
