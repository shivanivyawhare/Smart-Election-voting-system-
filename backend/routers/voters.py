"""Admin voter management (spec §17).

Verification metadata and vote-count totals are visible; a voter's candidate choice
is structurally invisible — ballot records never reference the voter, and vote marks
carry no choice. Moderation actions (approve/suspend) are audited.
"""

import re

from fastapi import APIRouter, HTTPException, Request

from lib.audit import record_audit
from lib.db import db
from lib.domain import get_election, voter_out
from lib.eligibility import evaluate
from lib.providers import notify_email
from lib.session import require_permission
from lib.security import now_utc

router = APIRouter()


@router.get("/admin/voters")
async def list_voters(request: Request, search: str | None = None, status: str | None = None,
                      constituency_id: str | None = None, page: int = 1, page_size: int = 25):
    await require_permission("voter:view")(request)
    page = max(1, page)
    page_size = min(100, max(5, page_size))
    query: dict = {}
    if status:
        query["status"] = status.upper()
    if constituency_id:
        query["constituency_id"] = constituency_id
    if search:
        escaped = re.escape(search)
        query["$or"] = [
            {"full_name": {"$regex": escaped, "$options": "i"}},
            {"email": {"$regex": escaped, "$options": "i"}},
            {"voter_ref": {"$regex": escaped, "$options": "i"}},
        ]
    total = await db.voters.count_documents(query)
    docs = await db.voters.find(query, {"password_hash": 0}).sort([("created_at", -1)]) \
        .skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    ids = [v["id"] for v in docs]
    counts: dict[str, int] = {}
    async for mark in db.voting_marks.find({"voter_id": {"$in": ids}}, {"voter_id": 1}):
        counts[mark["voter_id"]] = counts.get(mark["voter_id"], 0) + 1
    items = []
    for v in docs:
        out = voter_out(v)
        out["votes_cast"] = counts.get(v["id"], 0)
        items.append(out)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/admin/voters/{voter_id}")
async def voter_detail(voter_id: str, request: Request):
    await require_permission("voter:view")(request)
    v = await db.voters.find_one({"id": voter_id}, {"password_hash": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Voter not found.")

    txns = await db.identity_verifications.find(
        {"voter_id": voter_id, "kind": "TRANSACTION"},
        {"otp_hash": 0}).sort([("created_at", -1)]).to_list(20)
    events = await db.security_events.find({"voter_id": voter_id}) \
        .sort([("created_at", -1)]).to_list(20)
    face_attempts = await db.face_verifications.count_documents(
        {"voter_id": voter_id, "kind": "ATTEMPT"})
    liveness = await db.liveness_sessions.find({"voter_id": voter_id}) \
        .sort([("created_at", -1)]).to_list(10)
    votes_cast = await db.voting_marks.count_documents({"voter_id": voter_id})

    elections_view = []
    for e in await db.elections.find().sort([("start_at", -1)]).to_list(50):
        elig = await evaluate(v, e)
        elections_view.append({"id": e["id"], "name": e["name"], "status": e["status"],
                               "eligibility": elig})

    return {
        "voter": voter_out(v),
        "votes_cast": votes_cast,  # count only — never the choice
        "identity_transactions": [{
            "id": t["id"], "provider": t["provider"], "status": t["status"],
            "purpose": t["purpose"], "masked_ref": t.get("masked_ref"),
            "created_at": t["created_at"], "verified_at": t.get("verified_at"),
        } for t in txns],
        "face": {"verified": bool(v.get("face_verified")), "attempts": face_attempts},
        "liveness": {"verified": bool(v.get("liveness_verified")),
                     "sessions": [{"id": s["id"], "status": s["status"],
                                   "created_at": s["created_at"]} for s in liveness]},
        "security_events": [{"id": ev["id"], "event_type": ev["event_type"],
                             "severity": ev["severity"], "created_at": ev["created_at"]}
                            for ev in events],
        "elections": elections_view,
    }


@router.post("/admin/voters/{voter_id}/approve")
async def approve_voter(voter_id: str, request: Request):
    admin = await require_permission("voter:moderate")(request)
    v = await db.voters.find_one({"id": voter_id})
    if not v:
        raise HTTPException(status_code=404, detail="Voter not found.")
    await db.voters.update_one({"id": voter_id},
                               {"$set": {"status": "APPROVED", "suspended": False,
                                         "updated_at": now_utc()}})
    await record_audit("VOTER_APPROVED", "voter", voter_id, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"voter_id": voter_id})
    await notify_email(v["email"], "Registration approved",
                       "Your voter registration has been approved. This is a sandbox notification.")
    return {"ok": True, "status": "APPROVED"}


@router.post("/admin/voters/{voter_id}/suspend")
async def suspend_voter(voter_id: str, request: Request):
    admin = await require_permission("voter:moderate")(request)
    v = await db.voters.find_one({"id": voter_id})
    if not v:
        raise HTTPException(status_code=404, detail="Voter not found.")
    await db.voters.update_one({"id": voter_id},
                               {"$set": {"status": "SUSPENDED", "suspended": True,
                                         "updated_at": now_utc()}})
    await record_audit("VOTER_SUSPENDED", "voter", voter_id, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"voter_id": voter_id})
    return {"ok": True, "status": "SUSPENDED"}


@router.post("/admin/voters/{voter_id}/unsuspend")
async def unsuspend_voter(voter_id: str, request: Request):
    admin = await require_permission("voter:moderate")(request)
    v = await db.voters.find_one({"id": voter_id})
    if not v:
        raise HTTPException(status_code=404, detail="Voter not found.")
    await db.voters.update_one({"id": voter_id},
                               {"$set": {"status": "APPROVED", "suspended": False,
                                         "updated_at": now_utc()}})
    await record_audit("VOTER_UNSUSPENDED", "voter", voter_id, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"voter_id": voter_id})
    return {"ok": True, "status": "APPROVED"}
