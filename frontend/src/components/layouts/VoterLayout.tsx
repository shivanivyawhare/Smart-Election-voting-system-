import { useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import {
  Camera, Fingerprint, LayoutDashboard, Loader2, LogOut, ReceiptText,
  ScanFace, ShieldAlert, Vote,
} from "lucide-react";
import { useAuthMe } from "@/hooks/useAuthMe";
import type { Voter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Crest } from "@/components/Crest";
import { SandboxStrip } from "@/components/SandboxStrip";
import { buttonVariants } from "@/components/ui/button";

const MOBILE_NAV = [
  { to: "/voter/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/voter/elections", label: "Elections", icon: Vote },
  { to: "/voter/vote-verification", label: "Verify", icon: ReceiptText },
  { to: "/voter/security", label: "Security", icon: ShieldAlert },
];

function VerificationChips({ voter }: { voter: Voter }) {
  const chips = [
    { label: "Identity", done: voter.identity_verified, icon: Fingerprint, testid: "voter-chip-identity" },
    { label: "Face", done: voter.face_verified, icon: Camera, testid: "voter-chip-face" },
    { label: "Liveness", done: voter.liveness_verified, icon: ScanFace, testid: "voter-chip-liveness" },
  ];
  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      {chips.map((c) => (
        <span
          key={c.label}
          data-testid={c.testid}
          title={`${c.label}: ${c.done ? "Verified" : "Pending"}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            c.done
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          <c.icon className="h-3 w-3" aria-hidden="true" />
          {c.label}
        </span>
      ))}
    </div>
  );
}

export default function VoterLayout() {
  const { data, isLoading } = useAuthMe();
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" data-testid="voter-layout-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  if (!data?.authenticated || data.role_type !== "voter" || !data.user || !("voter_ref_masked" in data.user)) {
    return <Navigate to="/voter/login" replace />;
  }
  const voter = data.user as Voter;

  return (
    <div className="flex min-h-svh flex-col bg-background pb-16 md:pb-0">
      <SandboxStrip />
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Crest className="h-8 w-8" />
            <div className="leading-tight">
              <span className="block font-heading text-sm font-bold">Voter Portal</span>
              <span className="block font-mono text-[11px] text-slate-500" data-testid="voter-masked-ref">
                {voter.voter_ref_masked}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <VerificationChips voter={voter} />
            <a
              href="/voter/logout"
              data-testid="voter-logout-link"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </a>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 px-4 pb-1 md:flex" aria-label="Voter portal">
          {[
            { to: "/voter/dashboard", label: "Dashboard" },
            { to: "/voter/elections", label: "Elections" },
            { to: "/voter/vote-verification", label: "Verify Ballot" },
            { to: "/voter/profile", label: "Profile" },
            { to: "/voter/security", label: "Security" },
          ].map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white md:hidden"
        aria-label="Voter mobile navigation"
      >
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-primary" : "text-slate-500",
              )
            }
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function LogoutPage() {
  const [done, setDone] = useState(false);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const { endSession } = await import("@/lib/session");
      await endSession();
      setDone(true);
    })();
  }, []);
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4" data-testid="voter-logout-page">
      <Crest />
      <h1 className="font-heading text-xl font-bold">{done ? "Signed out" : "Signing out…"}</h1>
      <p className="text-sm text-muted-foreground">Your session has been cleared on this device.</p>
      <div className="flex gap-2">
        <a href="/voter/login" data-testid="logout-to-login" className={buttonVariants()}>
          Voter Login
        </a>
        <a href="/" data-testid="logout-to-home" className={buttonVariants({ variant: "outline" })}>
          Home
        </a>
      </div>
    </div>
  );
}
