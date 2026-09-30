"""Audit + security monitor routes (spec §27, §28).

Audit entries are append-only: these routes are read-only by design — the
application exposes no update or delete path for audit logs.
"""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from lib.audit import record_audit
from lib.db import db
from lib.security import now_utc
from lib.session import require_permission

router = APIRouter()


class FraudReviewIn(BaseModel):
    status: str  # DISMISSED | ACTION_TAKEN
    note: str = ""


@router.get("/audit")
async def list_audit(request: Request, action: str | None = None, actor: str | None = None,
                     page: int = 1, page_size: int = 25):
    await require_permission("audit:view")(request)
    page = max(1, page)
    page_size = min(100, max(5, page_size))
    query: dict = {}
    if action:
        query["action"] = {"$regex": action.upper()}
    if actor:
        query["$or"] = [{"actor_id": actor}, {"actor_role": actor.upper()}]
    total = await db.audit_logs.count_documents(query)
    entries = await db.audit_logs.find(query, {"_id": 0}).sort([("seq", -1)]) \
        .skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": entries}


@router.get("/audit/{entry_id}")
async def audit_detail(entry_id: str, request: Request):
    await require_permission("audit:view")(request)
    entry = await db.audit_logs.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Audit entry not found.")
    return entry


@router.get("/security/events")
async def security_events(request: Request, severity: str | None = None,
                          event_type: str | None = None, limit: int = 100):
    await require_permission("security:view")(request)
    query: dict = {}
    if severity:
        query["severity"] = severity.upper()
    if event_type:
        query["event_type"] = event_type.upper()
    events = await db.security_events.find(query, {"_id": 0}).sort([("created_at", -1)]) \
        .limit(min(300, max(10, limit))).to_list(300)
    total = await db.security_events.count_documents(query)
    return {"total": total, "items": events}


@router.get("/security/summary")
async def security_summary(request: Request):
    await require_permission("security:view")(request)
    day_ago = now_utc() - timedelta(hours=24)
    events = await db.security_events.find({"created_at": {"$gte": day_ago}}).to_list(5000)

    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    ip_failures: dict[str, int] = {}
    for ev in events:
        by_type[ev["event_type"]] = by_type.get(ev["event_type"], 0) + 1
        by_severity[ev["severity"]] = by_severity.get(ev["severity"], 0) + 1
        if ev["severity"] in ("MEDIUM", "HIGH") and ev.get("ip_address"):
            ip_failures[ev["ip_address"]] = ip_failures.get(ev["ip_address"], 0) + 1

    locked_admins = await db.admins.count_documents({"locked_until": {"$gt": now_utc()}})
    open_flags = await db.fraud_flags.count_documents({"status": "FLAG_FOR_REVIEW"})
    return {
        "failed_logins_24h": by_type.get("VOTER_LOGIN_FAILED", 0) + by_type.get("ADMIN_LOGIN_FAILED", 0),
        "locked_accounts": locked_admins,
        "failed_identity_24h": by_type.get("IDENTITY_VERIFICATION_FAILED", 0),
        "failed_liveness_24h": by_type.get("LIVENESS_FAILED", 0),
        "rate_limited_24h": by_type.get("RATE_LIMITED", 0),
        "duplicate_vote_attempts_24h": by_type.get("DUPLICATE_VOTE_ATTEMPT", 0),
        "open_fraud_flags": open_flags,
        "events_by_type": by_type,
        "events_by_severity": by_severity,
        "suspicious_ips": [{"ip": ip, "events": n} for ip, n in
                           sorted(ip_failures.items(), key=lambda kv: -kv[1])[:10]],
        "window": "24h",
    }


@router.get("/security/fraud-flags")
async def fraud_flags(request: Request, status: str | None = None):
    await require_permission("security:view")(request)
    query = {"status": status.upper()} if status else {}
    flags = await db.fraud_flags.find(query, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    total = await db.fraud_flags.count_documents(query)
    return {"total": total, "items": flags}


@router.post("/security/fraud-flags/{flag_id}/review")
async def review_fraud_flag(flag_id: str, body: FraudReviewIn, request: Request):
    admin = await require_permission("fraud:review")(request)
    flag = await db.fraud_flags.find_one({"id": flag_id})
    if not flag:
        raise HTTPException(status_code=404, detail="Fraud flag not found.")
    if body.status not in ("DISMISSED", "ACTION_TAKEN"):
        raise HTTPException(status_code=400, detail="Review status must be DISMISSED or ACTION_TAKEN.")
    await db.fraud_flags.update_one(
        {"id": flag_id},
        {"$set": {"status": body.status, "reviewed_by": admin["id"],
                  "review_note": body.note, "updated_at": now_utc()}})
    await record_audit("FRAUD_FLAG_REVIEWED", "fraud_flag", flag_id, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"flag_id": flag_id, "outcome": body.status})
    return {"ok": True, "status": body.status}
