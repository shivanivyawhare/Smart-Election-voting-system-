# Smart E-Election System — living spec

Sandbox-labelled, production-oriented e-voting platform. FastAPI + MongoDB backend,
Vite + React 19 + TS frontend. DEVELOPMENT_MODE=true (synthetic data).

## Portals (all separate layouts/routes)
- **Public**: `/`, `/about`, `/how-it-works`, `/security`, `/privacy`, `/faq`, `/contact`, `/login`, `/results`
- **System status**: `/system-status` (real health checks)
- **Voter**: `/voter/login|register|verify-identity|face-verification|liveness|dashboard|elections|election/:id|candidates/:id|ballot/:id|vote-success|receipt|vote-verification|profile|security|logout`
- **Admin**: `/admin/login|dashboard|elections|elections/:id|constituencies|candidates|voters|voters/:id|eligibility|voting-monitor|fraud-monitor|security|audit-logs|blockchain|results|reports|settings|admin-users`

## Auth
httpOnly cookie sessions (`ev_access`, `ev_refresh`); no token in JSON.
Voter: email + password. Admin: password → mandatory MFA (sandbox code shown in dev),
5 failed MFA attempts → 15-minute lockout. RBAC in `backend/lib/session.py`
(SUPER_ADMIN, ELECTION_ADMIN, AUDITOR, RESULTS_OFFICER, SECURITY_OFFICER).

## Data model (MongoDB collections)
voters, admins, constituencies, elections, candidates, identity_verifications,
face_verifications, liveness_sessions, voting_sessions, **voting_marks** (unique
`(election_id, voter_id)` — the double-vote constraint), **ballot_records**
(AES-256-GCM `encrypted_choice`, NO voter reference), vote_receipts,
election_results, audit_logs (hash-chained), security_events, fraud_flags,
blockchain_blocks (hash-chained ledger), notifications, system_settings, counters.

## Key flows
1. **Verification**: consent → identity OTP (sandbox) → face capture scoring → random
   server-side liveness challenges. Raw refs/OTPs/images are never stored.
2. **Voting**: session → eligibility engine (7 conditions) → ballot → review dialog →
   cast with `Idempotency-Key`. Unique index decides duplicates; failure rolls back
   fully. Commitment anchored to ledger; receipt returned.
3. **Counting**: CLOSED → generate (decrypt + tally) → snapshot hashed + anchored →
   publish (RESULTS_PUBLISHED). No endpoint edits a total.
4. **Integrity**: `/api/blockchain/verify` recomputes the whole chain;
   `/api/results/{id}/integrity` recomputes the snapshot hash.

## Monitoring extras (`backend/routers/monitoring.py`)
- `GET /api/admin/turnout/alerts` (`monitor:view`) — per-constituency turnout of every OPEN
  election vs the election mean; a constituency below 80/60/40% of the mean is flagged
  MEDIUM/HIGH/CRITICAL. Rendered on `/admin/voting-monitor` (polls 20s).
- `GET /api/voter/activity` — the signed-in voter's own audit rows (sign-in, identity, face,
  liveness, voting) + security events, IPs masked. Rendered on `/voter/security`.
- `GET /api/admin/results/{id}/certificate` (`report:view`) — reportlab PDF result
  certificate (totals, turnout, result hash, ledger block, verification), from `/admin/reports`.
- `/admin/blockchain` polls blocks every 8s and badges newly appended blocks (live ledger feed).

## Election lifecycle
DRAFT → SCHEDULED → OPEN → (PAUSED) → CLOSED → COUNTING → RESULTS_PUBLISHED → ARCHIVED.
Illegal transitions 409. Past-end OPEN elections lazily auto-close (audited).

## Seed facts
3 constituencies (New Delhi Central NDL-01, Mumbai South MUM-01, Bengaluru South BLR-01),
10 candidates, 100 voters, 5 admins, 2 elections:
- `GE-2026-001` — OPEN, all 3 constituencies, ~60 seeded ballots
- `MUN-2025-BYE` — RESULTS_PUBLISHED with a hashed+anchored snapshot
Credentials: `memory/test_credentials.md`.

## Known deviations from the original brief
Pod stack is FastAPI + MongoDB (not Node/Express + PostgreSQL/Prisma/Redis) and the
ledger is the local permissioned hash-chain (not Hyperledger Fabric); Redis rate
limiting is an in-process sliding window. All functional requirements are implemented
on this stack.
