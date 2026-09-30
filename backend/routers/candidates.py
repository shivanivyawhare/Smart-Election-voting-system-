"""Candidate management (spec §16): admin CRUD + voter-visible candidate detail.

Duplicate candidates (same name + constituency + election) are rejected. After an
election has votes or closes, candidates are deactivated rather than deleted so
counted ballots stay valid.
"""

from fastapi import APIRouter, HTTPException, Request

from lib.audit import record_audit
from lib.db import db
from lib.ledger import append_block
from lib.security import canonical, new_id, now_utc, sha256_hex
from lib.session import require_admin, require_permission, require_voter
from models.elections import CandidateCreate, CandidateUpdate

router = APIRouter()

LOCKED_STATUSES = ("CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED")


def candidate_public(c: dict) -> dict:
    return {
        "id": c["id"], "election_id": c["election_id"], "constituency_id": c["constituency_id"],
        "name": c["name"], "party": c["party"], "symbol": c["symbol"],
        "description": c.get("description", ""), "photo_url": c.get("photo_url"),
        "status": c["status"], "created_at": c["created_at"],
    }


@router.get("/candidates/{candidate_id}")
async def candidate_detail(candidate_id: str, request: Request):
    await require_voter(request)
    c = await db.candidates.find_one({"id": candidate_id})
    if not c or c.get("status") != "ACTIVE":
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return candidate_public(c)


# ------------------------------------------------------------------ admin


@router.get("/admin/candidates")
async def admin_candidates(request: Request, election_id: str | None = None):
    await require_admin(request)  # candidate rosters are non-sensitive; any admin role may view
    query = {"election_id": election_id} if election_id else {}
    candidates = await db.candidates.find(query).sort(
        [("constituency_id", 1), ("name", 1)]).to_list(1000)
    consti_ids = {c["constituency_id"] for c in candidates}
    constis = {c["id"]: c for c in await db.constituencies.find(
        {"id": {"$in": list(consti_ids)}}).to_list(100)}
    return [{**candidate_public(c),
             "constituency_name": constis[c["constituency_id"]]["name"]
             if c["constituency_id"] in constis else "—"} for c in candidates]


@router.post("/admin/candidates")
async def create_candidate(body: CandidateCreate, request: Request):
    admin = await require_permission("candidate:create")(request)
    e = await db.elections.find_one({"id": body.election_id})
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    if e["status"] in LOCKED_STATUSES:
        raise HTTPException(status_code=409, detail="Candidates cannot be added after the election has closed.")
    if body.constituency_id not in e.get("constituency_ids", []):
        raise HTTPException(status_code=400, detail="The candidate's constituency must be part of this election.")
    dup = await db.candidates.find_one({
        "election_id": body.election_id, "constituency_id": body.constituency_id,
        "name": body.name.strip()})
    if dup:
        raise HTTPException(status_code=409,
                            detail="A candidate with this name already exists in this constituency for this election.")
    candidate = {
        "id": new_id(),
        "election_id": body.election_id,
        "constituency_id": body.constituency_id,
        "name": body.name.strip(),
        "party": body.party.strip(),
        "symbol": body.symbol.strip(),
        "description": body.description,
        "photo_url": body.photo_url,
        "status": "ACTIVE",
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.candidates.insert_one(candidate)
    await record_audit("CANDIDATE_CREATED", "candidate", candidate["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": candidate["election_id"], "name": candidate["name"]})
    await append_block("CANDIDATE_ADDED", election_id=candidate["election_id"],
                       record_hash=sha256_hex(canonical(candidate_public(candidate))),
                       metadata={"candidate_id": candidate["id"], "name": candidate["name"]})
    return candidate_public(candidate)


@router.put("/admin/candidates/{candidate_id}")
async def update_candidate(candidate_id: str, body: CandidateUpdate, request: Request):
    admin = await require_permission("candidate:update")(request)
    c = await db.candidates.find_one({"id": candidate_id})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    updates: dict = {"updated_at": now_utc()}
    for field in ("name", "party", "symbol", "description", "photo_url", "status", "constituency_id"):
        value = getattr(body, field)
        if value is not None:
            updates[field] = value.strip() if isinstance(value, str) else value
    if updates.get("name"):
        dup = await db.candidates.find_one({
            "election_id": c["election_id"], "constituency_id": updates.get("constituency_id", c["constituency_id"]),
            "name": updates["name"], "id": {"$ne": candidate_id}})
        if dup:
            raise HTTPException(status_code=409, detail="A candidate with this name already exists in this constituency.")
    await db.candidates.update_one({"id": candidate_id}, {"$set": updates})
    await record_audit("CANDIDATE_UPDATED", "candidate", candidate_id, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": c["election_id"], "fields": list(updates)})
    return candidate_public({**c, **updates})


@router.delete("/admin/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, request: Request):
    admin = await require_permission("candidate:delete")(request)
    c = await db.candidates.find_one({"id": candidate_id})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    e = await db.elections.find_one({"id": c["election_id"]})
    if e and e["status"] in LOCKED_STATUSES:
        raise HTTPException(status_code=409, detail="Candidate records are locked after the election closes.")
    if await db.voting_marks.count_documents({"election_id": c["election_id"]}, limit=1):
        # Votes exist — deleting would orphan counted ballots. Deactivate instead.
        await db.candidates.update_one({"id": candidate_id},
                                       {"$set": {"status": "INACTIVE", "updated_at": now_utc()}})
        await record_audit("CANDIDATE_DEACTIVATED", "candidate", candidate_id, actor_id=admin["id"],
                           actor_role=admin["role"], request=request,
                           metadata={"election_id": c["election_id"], "reason": "votes exist"})
        return {"deleted": False, "deactivated": True,
                "detail": "Votes already exist for this election — the candidate was deactivated instead of deleted."}
    await db.candidates.delete_one({"id": candidate_id})
    await record_audit("CANDIDATE_DELETED", "candidate", candidate_id, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": c["election_id"], "name": c["name"]})
    return {"deleted": True, "deactivated": False}
