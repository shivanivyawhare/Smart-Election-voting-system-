import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginHub() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16" data-testid="login-hub">
      <h1 className="text-center font-heading text-3xl font-bold tracking-tight text-slate-900">
        Choose your portal
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-center text-muted-foreground">
        Voter and administrator portals are fully separated applications with their own
        authentication, layouts and permissions.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card className="border-slate-200" data-testid="login-hub-voter">
          <CardContent className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B192C] text-white">
              <UserRound className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold">Voter Portal</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Register, verify identity, face and liveness, then cast your vote with a
              cryptographic receipt.
            </p>
            <Link
              to="/voter/login"
              data-testid="login-hub-voter-button"
              className={cn(buttonVariants(), "mt-6 w-full")}
            >
              Voter login <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
        <Card className="border-slate-200" data-testid="login-hub-admin">
          <CardContent className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#1D4ED8] text-white">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold">Admin Command Center</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Election management, monitoring, audit, blockchain integrity and result
              publication — with MFA and RBAC.
            </p>
            <Link
              to="/admin/login"
              data-testid="login-hub-admin-button"
              className={cn(buttonVariants({ variant: "outline" }), "mt-6 w-full")}
            >
              Admin login <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
