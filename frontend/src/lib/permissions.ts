// UX-only mirror of the backend RBAC map (backend/lib/session.py is the authority).
// Used to hide nav actions a role cannot perform — the backend still enforces 403s.
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["*"],
  ELECTION_ADMIN: [
    "election:view", "election:create", "election:update", "election:open", "election:close",
    "candidate:create", "candidate:update", "candidate:delete", "voter:view", "voter:moderate",
    "monitor:view", "result:view", "result:generate", "blockchain:view", "blockchain:verify",
    "settings:view", "report:view", "audit:view",
  ],
  AUDITOR: [
    "election:view", "voter:view", "monitor:view", "audit:view", "blockchain:view",
    "blockchain:verify", "result:view", "report:view", "security:view", "settings:view",
  ],
  RESULTS_OFFICER: [
    "election:view", "voter:view", "monitor:view", "result:view", "result:generate",
    "result:publish", "blockchain:view", "blockchain:verify", "report:view", "settings:view",
  ],
  SECURITY_OFFICER: [
    "election:view", "voter:view", "voter:moderate", "monitor:view", "security:view",
    "fraud:review", "audit:view", "blockchain:view", "blockchain:verify", "result:view",
    "settings:view",
  ],
};

export function can(role: string | undefined | null, permission: string): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes("*") || perms.includes(permission);
}
