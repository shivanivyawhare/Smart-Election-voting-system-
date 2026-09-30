import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useState } from "react";
import {
  Activity, BarChart3, Boxes, FileClock, FileText, LayoutDashboard, Loader2,
  LogOut, MapPin, Menu, ScanFace, ShieldAlert, ShieldCheck, UserCog, Users, Vote,
} from "lucide-react";
import { useAuthMe } from "@/hooks/useAuthMe";
import type { Admin } from "@/lib/types";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Crest } from "@/components/Crest";
import { SandboxStrip } from "@/components/SandboxStrip";

const NAV_SECTIONS: { title: string; items: { to: string; label: string; icon: typeof Vote; perm: string; testid: string }[] }[] = [
  {
    title: "Overview",
    items: [{ to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "election:view", testid: "admin-nav-dashboard" }],
  },
  {
    title: "Election Engine",
    items: [
      { to: "/admin/elections", label: "Elections", icon: Vote, perm: "election:view", testid: "admin-nav-elections" },
      { to: "/admin/constituencies", label: "Constituencies", icon: MapPin, perm: "election:view", testid: "admin-nav-constituencies" },
      { to: "/admin/candidates", label: "Candidates", icon: UserCog, perm: "election:view", testid: "admin-nav-candidates" },
      { to: "/admin/eligibility", label: "Eligibility Engine", icon: ScanFace, perm: "voter:view", testid: "admin-nav-eligibility" },
    ],
  },
  {
    title: "Voters & Monitoring",
    items: [
      { to: "/admin/voters", label: "Voters", icon: Users, perm: "voter:view", testid: "admin-nav-voters" },
      { to: "/admin/voting-monitor", label: "Voting Monitor", icon: Activity, perm: "monitor:view", testid: "admin-nav-voting-monitor" },
      { to: "/admin/fraud-monitor", label: "Fraud Monitor", icon: ShieldAlert, perm: "security:view", testid: "admin-nav-fraud-monitor" },
      { to: "/admin/security", label: "Security Monitor", icon: ShieldCheck, perm: "security:view", testid: "admin-nav-security" },
    ],
  },
  {
    title: "Integrity & Results",
    items: [
      { to: "/admin/audit-logs", label: "Audit Logs", icon: FileClock, perm: "audit:view", testid: "admin-nav-audit" },
      { to: "/admin/blockchain", label: "Blockchain", icon: Boxes, perm: "blockchain:view", testid: "admin-nav-blockchain" },
      { to: "/admin/results", label: "Results", icon: BarChart3, perm: "result:view", testid: "admin-nav-results" },
      { to: "/admin/reports", label: "Reports", icon: FileText, perm: "report:view", testid: "admin-nav-reports" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/admin/settings", label: "Settings", icon: Menu, perm: "settings:view", testid: "admin-nav-settings" },
      { to: "/admin/admin-users", label: "Admin Users", icon: UserCog, perm: "settings:view", testid: "admin-nav-admin-users" },
    ],
  },
];

function SidebarNav({ role, onNavigate }: { role: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-4 px-3 py-4" aria-label="Admin sections">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => can(role, i.perm));
        if (!items.length) return null;
        return (
          <div key={section.title}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  data-testid={item.testid}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-slate-300 hover:bg-sidebar-accent/60 hover:text-white",
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { data, isLoading } = useAuthMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" data-testid="admin-layout-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  if (!data?.authenticated || data.role_type !== "admin" || !data.user || !("role" in data.user)) {
    return <Navigate to="/admin/login" replace />;
  }
  const admin = data.user as Admin;

  return (
    <div className="flex min-h-svh bg-background">
      <SandboxStrip />

      {/* Fixed desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#0B192C] pt-10 md:flex" data-testid="admin-sidebar">
        <div className="flex h-10 items-center gap-2 border-b border-sidebar-border px-4">
          <Crest className="h-7 w-7 bg-white/10" />
          <span className="font-heading text-sm font-bold text-white">Admin Command Center</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={admin.role} />
        </div>
        <div className="border-t border-sidebar-border p-3 text-[11px] text-slate-500">
          Session: MFA verified · Role: {admin.role.replace(/_/g, " ")}
        </div>
      </aside>

      <div className="flex min-h-svh flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger render={<Button variant="outline" size="icon" className="md:hidden" aria-label="Open admin menu" />}>
                <Menu className="h-5 w-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-[#0B192C] p-0">
                <SheetHeader className="border-b border-sidebar-border px-4 py-3">
                  <SheetTitle className="text-white">Admin Menu</SheetTitle>
                </SheetHeader>
                <SidebarNav role={admin.role} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="font-heading text-sm font-bold text-slate-900">Election Commission Operations</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="admin-role-badge" className="border-slate-300 bg-slate-50 text-slate-700">
              {admin.role.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700" data-testid="admin-mfa-badge">
              MFA verified
            </Badge>
            <a
              href="/admin/logout"
              data-testid="admin-logout-link"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </a>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
