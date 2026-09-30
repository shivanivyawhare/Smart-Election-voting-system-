import type { ReactNode } from "react";
import { Crest } from "@/components/Crest";
import { SandboxStrip } from "@/components/SandboxStrip";

export function AuthCard({
  title,
  subtitle,
  children,
  testid,
  width = "max-w-md",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  testid?: string;
  width?: string;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <SandboxStrip />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className={`w-full ${width}`} data-testid={testid}>
          <div className="mb-6 flex items-center justify-center gap-3">
            <Crest />
            <span className="font-heading text-lg font-bold text-slate-900">Smart E-Election</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="font-heading text-xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
