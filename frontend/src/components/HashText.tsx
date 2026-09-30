import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncateHash } from "@/lib/format";

export function HashText({
  hash,
  testid,
  head = 10,
  tail = 6,
}: {
  hash?: string | null;
  testid?: string;
  head?: number;
  tail?: number;
}) {
  const [copied, setCopied] = useState(false);
  if (!hash) return <span className="font-mono text-xs text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      data-testid={testid}
      title="Copy full hash"
      onClick={() => {
        navigator.clipboard?.writeText(hash).catch(() => undefined);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 font-mono text-xs tracking-tight text-slate-800 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      <span>{truncateHash(hash, head, tail)}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3 opacity-60" aria-hidden="true" />
      )}
    </button>
  );
}
