"""Shared domain helpers: API serializers, settings lookup, election lookup with lazy auto-close."""

from pymongo import ReturnDocument

from lib.audit import record_audit
from lib.db import db
from lib.ledger import append_block
from lib.security import mask_ref, normalize_dt, now_utc


def voter_out(v: dict) -> dict:
    """API shape of a voter — mirrors the VoterOut TS interface in frontend/src/lib/types.ts."""
    return {
        "id": v["id"],
        "full_name": v["full_name"],
        "email": v["email"],
        "mobile": v["mobile"],
        "date_of_birth": v["date_of_birth"],
        "state": v["state"],
        "district": v["district"],
        "constituency_id": v.get("constituency_id"),
        "voter_ref_masked": v.get("voter_ref_masked") or mask_ref(v.get("voter_ref", "")),
        "status": v["status"],
        "suspended": v.get("suspended", False),
        "identity_verified": v.get("identity_verified", False),
        "face_verified": v.get("face_verified", False),
        "liveness_verified": v.get("liveness_verified", False),
        "identity_masked": v.get("identity_masked"),
        "created_at": v["created_at"],
    }


def admin_out(a: dict) -> dict:
    return {
        "id": a["id"],
        "email": a["email"],
        "full_name": a["full_name"],
        "role": a["role"],
        "status": a.get("status", "ACTIVE"),
        "failed_attempts": a.get("failed_attempts", 0),
        "locked_until": a.get("locked_until"),
        "last_login_at": a.get("last_login_at"),
        "created_at": a["created_at"],
    }


async def get_setting(key: str, default: str) -> str:
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else default


async def get_election(election_id: str) -> dict | None:
    """Election lookup with the lazy auto-close rule (past-end OPEN -> CLOSED, audited)."""
    election = await db.elections.find_one({"id": election_id})
    if not election:
        return None
    if election.get("status") != "OPEN":
        return election
    if normalize_dt(election["end_at"]) >= now_utc():
        return election
    updated = await db.elections.find_one_and_update(
        {"id": election["id"], "status": "OPEN"},
        {"$set": {"status": "CLOSED", "auto_closed": True, "closed_at": now_utc(),
                  "updated_at": now_utc()}},
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        await record_audit("ELECTION_AUTO_CLOSE", "election", updated["id"],
                           metadata={"election_id": updated["id"], "reason": "end time reached"})
        await append_block("ELECTION_CLOSED", election_id=updated["id"], metadata={"auto": True})
    return updated or election
