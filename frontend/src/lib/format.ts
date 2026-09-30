// Formatting helpers shared across the portals.

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function truncateHash(hash: string | null | undefined, head = 10, tail = 6): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function statusTone(status: string): string {
  switch (status) {
    case "VERIFIED":
    case "APPROVED":
    case "OPEN":
    case "ACTIVE":
    case "PUBLISHED":
    case "RESULTS_PUBLISHED":
    case "healthy":
    case "CHAIN VALID":
      return "verified";
    case "PENDING":
    case "SCHEDULED":
    case "PROCESSING":
    case "DRAFT":
    case "COUNTING":
    case "degraded":
      return "pending";
    case "FAILED":
    case "SUSPENDED":
    case "LOCKED":
    case "CLOSED":
    case "unhealthy":
      return "failed";
    case "PAUSED":
      return "warning";
    default:
      return "neutral";
  }
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
