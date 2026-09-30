"""Append-only audit log (spec §28).

Every sensitive action records one entry. Entries are hash-chained
(previous_hash -> current_hash) and anchored into the ledger. There is no update
or delete path anywhere in the application.
"""

import logging

from pymongo import DESCENDING, IndexModel, ReturnDocument

from lib.db import db
from lib.ledger import append_block
from lib.security import canonical, new_id, now_utc, sha256_hex

logger = logging.getLogger(__name__)

GENESIS = "0" * 64


async def record_audit(action: str, resource_type: str, resource_id: str | None = None,
                       actor_id: str = "system", actor_role: str = "SYSTEM", request=None,
                       result: str = "success", metadata: dict | None = None) -> dict:
    meta = metadata or {}
    ip = ua = request_id = None
    if request is not None:
        try:
            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent")
            request_id = request.headers.get("x-request-id") or new_id()
        except Exception:
            pass
    counter = await db.counters.find_one_and_update(
        {"_id": "audit_seq"}, {"$inc": {"seq": 1}}, upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    last = await db.audit_logs.find_one({}, sort=[("seq", DESCENDING)])
    entry = {
        "id": new_id(),
        "seq": counter["seq"],
        "timestamp": now_utc(),
        "actor_id": actor_id,
        "actor_role": actor_role,
        "action": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id else None,
        "ip_address": ip,
        "user_agent": ua,
        "request_id": request_id,
        "result": result,
        "metadata": meta,
        "previous_hash": last["current_hash"] if last else GENESIS,
    }
    entry["current_hash"] = sha256_hex(
        canonical({k: v for k, v in entry.items() if k != "current_hash"})
    )
    await db.audit_logs.insert_one(entry)
    try:
        await append_block("AUDIT_LOG", election_id=meta.get("election_id"),
                           record_hash=entry["current_hash"], metadata={"action": action})
    except Exception as exc:  # anchoring is best-effort; the audit row itself is committed
        logger.error("ledger anchor failed for audit %s: %s", action, exc)
    return entry


async def record_security_event(event_type: str, severity: str = "LOW", voter_id: str | None = None,
                                ip: str | None = None, metadata: dict | None = None) -> None:
    """Security/fraud telemetry feed (failed logins, liveness failures, rate limits, ...)."""
    await db.security_events.insert_one({
        "id": new_id(),
        "event_type": event_type,
        "severity": severity,
        "voter_id": voter_id,
        "ip_address": ip,
        "metadata": metadata or {},
        "created_at": now_utc(),
    })


async def evaluate_risk(voter_id: str | None, event_type: str, ip: str | None = None) -> None:
    """Escalation rules — FLAG_FOR_REVIEW, never an automatic accusation (spec §26)."""
    from datetime import timedelta
    since = now_utc() - timedelta(minutes=15)
    query = {"created_at": {"$gte": since}}
    if voter_id:
        query["voter_id"] = voter_id
    elif ip:
        query["ip_address"] = ip
    recent = await db.security_events.count_documents({**query, "event_type": event_type})

    thresholds = {
        "IDENTITY_VERIFICATION_FAILED": (3, "MEDIUM", "Multiple failed identity verification attempts"),
        "LIVENESS_FAILED": (3, "HIGH", "Multiple failed liveness attempts — possible spoofing"),
        "VOTER_LOGIN_FAILED": (5, "MEDIUM", "Repeated failed voter logins"),
        "ADMIN_LOGIN_FAILED": (5, "HIGH", "Repeated failed admin logins — possible brute force"),
        "DUPLICATE_VOTE_ATTEMPT": (1, "MEDIUM", "Duplicate voting attempt"),
        "FACE_VERIFICATION_FAILED": (3, "MEDIUM", "Multiple face verification failures"),
        "RATE_LIMITED": (5, "MEDIUM", "Sustained request rate abuse"),
    }
    if event_type not in thresholds or recent < thresholds[event_type][0]:
        return
    _, level, reason = thresholds[event_type]
    existing = await db.fraud_flags.find_one({
        "subject_id": voter_id or ip, "event_type": event_type, "status": "FLAG_FOR_REVIEW",
    })
    if existing:
        await db.fraud_flags.update_one(
            {"id": existing["id"]},
            {"$inc": {"occurrences": 1}, "$set": {"updated_at": now_utc(),
             "risk_level": level if level == "HIGH" else existing["risk_level"]}},
        )
        return
    await db.fraud_flags.insert_one({
        "id": new_id(),
        "subject_id": voter_id or ip,
        "subject_type": "voter" if voter_id else "ip",
        "event_type": event_type,
        "risk_level": level,
        "reason": reason,
        "occurrences": recent,
        "status": "FLAG_FOR_REVIEW",
        "reviewed_by": None,
        "review_note": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    })


def audit_indexes() -> list[IndexModel]:
    return [
        IndexModel([("seq", DESCENDING)], name="seq_desc"),
        IndexModel([("current_hash", ASCENDING)], name="current_hash"),
        IndexModel([("action", ASCENDING), ("timestamp", DESCENDING)], name="action_time"),
        IndexModel([("actor_id", ASCENDING), ("timestamp", DESCENDING)], name="actor_time"),
    ]
