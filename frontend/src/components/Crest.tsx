import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function Crest({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B192C] text-white shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      <ShieldCheck className="h-5 w-5" />
    </div>
  );
}
