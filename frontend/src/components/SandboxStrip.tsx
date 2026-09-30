import { FlaskConical } from "lucide-react";

export function SandboxStrip() {
  return (
    <div
      data-testid="sandbox-environment-banner"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        DEVELOPMENT / SANDBOX ENVIRONMENT — synthetic data only. Verification results are
        sandbox results, not real government (UIDAI) verification.
      </span>
    </div>
  );
}
