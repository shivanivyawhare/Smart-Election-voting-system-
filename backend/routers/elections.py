"""Election management (admin) + voter/public election listings (spec §15).

Lifecycle: DRAFT -> SCHEDULED -> OPEN -> PAUSED/CLOSED -> COUNTING -> RESULTS_PUBLISHED
-> ARCHIVED. Invalid transitions are rejected; every state change is audited and
anchored into the ledger. Publishing results goes through the results workflow only.
"""

from fastapi import APIRouter, HTTPException, Request

from lib.audit import record_audit
from lib.db import db
from lib.domain import get_election
from lib.eligibility import evaluate
from lib.ledger import append_block
from lib.security import canonical, new_id, now_utc, sha256_hex
from lib.session import require_permission, require_voter
from models.elections import (ALLOWED_TRANSITIONS, ElectionCreate, ElectionUpdate,
                              TransitionRequest)

router = APIRouter()

# RBAC per lifecycle operation (spec §36) — no role may perform every operation.
TRANSITION_PERMISSION = {
    "SCHEDULED": "election:update",
    "OPEN": "election:open",
    "PAUSED": "election:close",
    "CLOSED": "election:close",
    "COUNTING": "result:generate",
    "RESULTS_PUBLISHED": "result:publish",
    "ARCHIVED": "election:update",
}


def election_out(e: dict) -> dict:
    return {
        "id": e["id"],
        "election_code": e["election_code"],
        "name": e["name"],
        "description": e["description"],
        "election_type": e["election_type"],
        "status": e["status"],
        "start_at": e["start_at"],
        "end_at": e["end_at"],
        "constituency_ids": e.get("constituency_ids", []),
        "auto_closed": e.get("auto_closed", False),
        "results_published_at": e.get("results_published_at"),
        "created_by": e.get("created_by"),
        "created_at": e["created_at"],
        "updated_at": e["updated_at"],
    }


@router.get("/constituencies")
async def public_constituencies():
    """Public constituency list (code/name/state/district — non-sensitive)."""
    docs = await db.constituencies.find({}).sort([("name", 1)]).to_list(200)
    return [{"id": c["id"], "code": c["code"], "name": c["name"], "state": c["state"],
             "district": c["district"]} for c in docs]


@router.get("/elections/public")
async def public_elections():
    """Public listing for the website and results portal — no personal data."""
    elections = await db.elections.find().sort([("start_at", -1)]).to_list(200)
    out = []
    for e in elections:
        candidate_count = await db.candidates.count_documents({"election_id": e["id"]})
        constis = await db.constituencies.find(
            {"id": {"$in": e.get("constituency_ids", [])}}).sort([("name", 1)]).to_list(50)
        out.append({
            "id": e["id"], "election_code": e["election_code"], "name": e["name"],
            "description": e["description"], "election_type": e["election_type"],
            "status": e["status"], "start_at": e["start_at"], "end_at": e["end_at"],
            "constituencies": [{"id": c["id"], "code": c["code"], "name": c["name"]} for c in constis],
            "candidate_count": candidate_count,
            "results_published": e["status"] == "RESULTS_PUBLISHED",
        })
    return out


@router.get("/elections")
async def voter_elections(request: Request):
    """Voter listing with per-election eligibility + own voting status."""
    voter = await require_voter(request)
    elections = await db.elections.find().sort([("start_at", -1)]).to_list(200)
    out = []
    for e in elections:
        elig = await evaluate(voter, e)
        out.append({**election_out(e), "eligibility": elig})
    return out


@router.get("/elections/{election_id}")
async def voter_election_detail(election_id: str, request: Request):
    voter = await require_voter(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    elig = await evaluate(voter, e)
    candidates = await db.candidates.find(
        {"election_id": e["id"], "status": "ACTIVE"}).sort([("name", 1)]).to_list(300)
    constituency = None
    if voter.get("constituency_id"):
        constituency = await db.constituencies.find_one({"id": voter["constituency_id"]})
    return {
        **election_out(e),
        "eligibility": elig,
        "candidates": [candidate_public(c) for c in candidates],
        "voter_constituency": ({"id": constituency["id"], "code": constituency["code"],
                                "name": constituency["name"]} if constituency else None),
        "voting_open": elig["reason"] == "ALLOW_VOTE" or elig["reason"] == "ALREADY_VOTED",
    }


def candidate_public(c: dict) -> dict:
    return {
        "id": c["id"], "election_id": c["election_id"], "constituency_id": c["constituency_id"],
        "name": c["name"], "party": c["party"], "symbol": c["symbol"],
        "description": c.get("description", ""), "photo_url": c.get("photo_url"),
        "status": c["status"], "created_at": c["created_at"],
    }


# ------------------------------------------------------------------ admin


@router.get("/admin/elections")
async def admin_list_elections(request: Request):
    await require_permission("election:view")(request)
    elections = await db.elections.find().sort([("created_at", -1)]).to_list(500)
    out = []
    for e in elections:
        votes = await db.voting_marks.count_documents({"election_id": e["id"]})
        candidate_count = await db.candidates.count_documents({"election_id": e["id"]})
        out.append({**election_out(e), "votes_cast": votes, "candidate_count": candidate_count})
    return out


@router.get("/admin/elections/{election_id}")
async def admin_election_detail(election_id: str, request: Request):
    await require_permission("election:view")(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    candidates = await db.candidates.find({"election_id": e["id"]}).sort([("name", 1)]).to_list(500)
    marks = await db.voting_marks.find({"election_id": e["id"]}).sort([("voted_at", -1)]).to_list(2000)
    votes_by_constituency: dict[str, int] = {}
    for m in marks:
        cid = m.get("constituency_id") or "unknown"
        votes_by_constituency[cid] = votes_by_constituency.get(cid, 0) + 1
    eligible_voters = await db.voters.count_documents({
        "constituency_id": {"$in": e.get("constituency_ids", [])},
        "status": "APPROVED", "suspended": False})
    return {
        **election_out(e),
        "candidates": [candidate_public(c) for c in candidates],
        "votes_cast": len(marks),
        "eligible_voters": eligible_voters,
        "votes_by_constituency": votes_by_constituency,
        # Vote marks show THAT a voter voted, never FOR WHOM — no choice is stored.
        "recent_votes": [{"receipt_id": m["receipt_id"], "voted_at": m["voted_at"],
                          "constituency_id": m.get("constituency_id")} for m in marks[:100]],
    }


@router.post("/admin/elections")
async def create_election(body: ElectionCreate, request: Request):
    admin = await require_permission("election:create")(request)
    if body.end_at <= body.start_at:
        raise HTTPException(status_code=400, detail="The election end time must be after the start time.")
    if await db.elections.find_one({"election_code": body.election_code.upper()}):
        raise HTTPException(status_code=409, detail="An election with this election ID already exists.")
    found = await db.constituencies.count_documents({"id": {"$in": body.constituency_ids}})
    if found != len(set(body.constituency_ids)):
        raise HTTPException(status_code=400, detail="One or more selected constituencies do not exist.")
    election = {
        "id": new_id(),
        "election_code": body.election_code.upper(),
        "name": body.name.strip(),
        "description": body.description,
        "election_type": body.election_type,
        "status": "DRAFT",
        "start_at": body.start_at,
        "end_at": body.end_at,
        "constituency_ids": list(dict.fromkeys(body.constituency_ids)),
        "auto_closed": False,
        "results_published_at": None,
        "created_by": admin["id"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.elections.insert_one(election)
    config_hash = sha256_hex(canonical({k: election[k] for k in
                                        ("election_code", "name", "start_at", "end_at", "constituency_ids")}))
    await record_audit("ELECTION_CREATED", "election", election["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": election["id"], "name": election["name"]})
    await append_block("ELECTION_CREATED", election_id=election["id"], record_hash=config_hash,
                       metadata={"name": election["name"], "election_code": election["election_code"]})
    return election_out(election)


@router.put("/admin/elections/{election_id}")
async def update_election(election_id: str, body: ElectionUpdate, request: Request):
    admin = await require_permission("election:update")(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    if e["status"] not in ("DRAFT", "SCHEDULED"):
        raise HTTPException(status_code=409,
                            detail="Election configuration is frozen once the election opens.")
    updates: dict = {"updated_at": now_utc()}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description
    if body.election_type is not None:
        updates["election_type"] = body.election_type
    if body.start_at is not None:
        updates["start_at"] = body.start_at
    if body.end_at is not None:
        updates["end_at"] = body.end_at
    if updates.get("start_at") or updates.get("end_at"):
        start = updates.get("start_at") or e["start_at"]
        end = updates.get("end_at") or e["end_at"]
        if end <= start:
            raise HTTPException(status_code=400, detail="The election end time must be after the start time.")
    if body.constituency_ids is not None:
        found = await db.constituencies.count_documents({"id": {"$in": body.constituency_ids}})
        if found != len(set(body.constituency_ids)):
            raise HTTPException(status_code=400, detail="One or more selected constituencies do not exist.")
        updates["constituency_ids"] = list(dict.fromkeys(body.constituency_ids))
    await db.elections.update_one({"id": e["id"]}, {"$set": updates})
    await record_audit("ELECTION_UPDATED", "election", e["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": e["id"], "fields": [k for k in updates if k != "updated_at"]})
    await append_block("ELECTION_CONFIG_CHANGED", election_id=e["id"],
                       record_hash=sha256_hex(canonical(updates)), metadata={"fields": list(updates)})
    return election_out({**e, **updates})


@router.post("/admin/elections/{election_id}/transition")
async def transition_election(election_id: str, body: TransitionRequest, request: Request):
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    target = body.status.upper()
    if target not in ALLOWED_TRANSITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown election status '{target}'.")
    if target == "RESULTS_PUBLISHED":
        raise HTTPException(status_code=400,
                            detail="Publishing results goes through the results workflow (POST /api/results/{id}/publish).")
    if target not in ALLOWED_TRANSITIONS[e["status"]]:
        allowed = ALLOWED_TRANSITIONS[e["status"]] or ["(none)"]
        raise HTTPException(status_code=409,
                            detail=f"Illegal state transition {e['status']} -> {target}. Allowed next: {', '.join(allowed)}.")
    admin = await require_permission(TRANSITION_PERMISSION[target])(request)

    updates: dict = {"status": target, "updated_at": now_utc()}
    if target == "OPEN":
        updates["opened_at"] = now_utc()
    if target == "CLOSED":
        updates["closed_at"] = now_utc()
    if target == "COUNTING":
        updates["counting_started_at"] = now_utc()
    await db.elections.update_one({"id": e["id"]}, {"$set": updates})
    await record_audit(f"ELECTION_{target}", "election", e["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": e["id"], "from": e["status"], "to": target})
    ledger_event = {"OPEN": "ELECTION_OPENED", "CLOSED": "ELECTION_CLOSED"}.get(target)
    if ledger_event:
        await append_block(ledger_event, election_id=e["id"],
                           metadata={"from": e["status"], "to": target})
    return election_out({**e, **updates})
