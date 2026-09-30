import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu, Vote } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { HealthData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Crest } from "@/components/Crest";
import { SandboxStrip } from "@/components/SandboxStrip";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/security", label: "Security" },
  { to: "/results", label: "Results" },
  { to: "/faq", label: "FAQ" },
  { to: "/system-status", label: "Status" },
];

function HealthBadge() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthData>("/health"),
    retry: false,
    staleTime: 30_000,
  });
  const ok = health.data?.status === "healthy";
  return (
    <span
      data-testid="system-health-badge"
      className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 lg:inline-flex"
      title="Live system health (real checks, not a mock)"
    >
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : health.isError ? "bg-slate-400" : "bg-amber-500"}`}
        aria-hidden="true"
      />
      {health.data ? (ok ? "System operational" : health.data.status) : health.isError ? "Status offline" : "Checking…"}
    </span>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SandboxStrip />
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-3" data-testid="public-home-link">
            <Crest />
            <span className="leading-tight">
              <span className="block font-heading text-sm font-bold tracking-tight text-slate-900">
                Smart E-Election
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                National Election Commission · Sandbox
              </span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <HealthBadge />
            <a
              href="/voter/login"
              data-testid="nav-voter-login"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}
            >
              Voter Login
            </a>
            <a
              href="/admin/login"
              data-testid="nav-admin-login"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Admin Login
            </a>
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon" className="md:hidden" aria-label="Open menu" />
                }
              >
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Vote className="h-4 w-4" /> Navigation
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
                  {NAV_LINKS.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.to === "/"}
                      className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {l.label}
                    </NavLink>
                  ))}
                  <NavLink to="/voter/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    Voter Login
                  </NavLink>
                  <NavLink to="/admin/login" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    Admin Login
                  </NavLink>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-slate-900 py-12 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Crest className="bg-white/10" />
              <span className="font-heading text-sm font-bold text-white">Smart E-Election</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              A layered digital election platform: identity verification, face + liveness
              checks, secret-ballot separation, and a tamper-evident hash-chained ledger.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Portals</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a className="hover:text-white" href="/voter/login">Voter Portal</a></li>
              <li><a className="hover:text-white" href="/admin/login">Admin Portal</a></li>
              <li><a className="hover:text-white" href="/results">Public Results</a></li>
              <li><a className="hover:text-white" href="/system-status">System Status</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Security</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a className="hover:text-white" href="/security">Security Model</a></li>
              <li><a className="hover:text-white" href="/privacy">Privacy Architecture</a></li>
              <li><a className="hover:text-white" href="/how-it-works">How It Works</a></li>
              <li><a className="hover:text-white" href="/contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Disclaimer</p>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              DEVELOPMENT / SANDBOX ENVIRONMENT. Synthetic data only; verification results are
              sandbox results, never real UIDAI verification. Ballots are AES-256-GCM encrypted;
              the ledger anchors SHA-256 integrity hashes only.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-slate-800 px-4 pt-6 text-xs text-slate-500">
          © {new Date().getFullYear()} Smart E-Election System — final-year project build.
        </div>
      </footer>
    </div>
  );
}
