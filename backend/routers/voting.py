"""Voting routes (spec §18, §20, §21, §30, §31, §40, §41).

Ballot secrecy by construction:
- vote marks record THAT a voter voted — unique per election, DB-enforced;
- ballot records store an AES-256-GCM encrypted choice and never a voter reference;
- receipts prove inclusion without revealing the choice.

Casting is idempotent (Idempotency-Key header) and duplicate-vote safe: the unique
(election_id, voter_id) index decides, not application checks.
"""

from pymongo.errors import DuplicateKeyError
from datetime import timedelta

from fastapi import APIRouter, Header, HTTPException, Request

from lib.audit import evaluate_risk, record_audit, record_security_event
from lib.db import db
from lib.domain import get_election
from lib.eligibility import evaluate
from lib.ledger import append_block, verify_chain
from lib.ratelimit import hit
from lib.security import (encrypt_ballot, expired, new_id, now_utc, sha256_hex)
from lib.session import require_permission, require_voter
from models.voting import VoteCastIn, VotingSessionCreate

router = APIRouter()

SESSION_TTL_MINUTES = 15


def _receipt_out(r: dict) -> dict:
    return {
        "receipt_id": r["id"],
        "election_id": r["election_id"],
        "commitment": r["commitment"],
        "block_index": r.get("block_index"),
        "created_at": r["created_at"],
    }


@router.post("/voting/session")
async def create_voting_session(body: VotingSessionCreate, request: Request):
    voter = await require_voter(request)
    ip = request.client.host if request.client else "unknown"
    if not hit(f"vsession:{voter['id']}", 15, 300):
        await record_security_event("RATE_LIMITED", "MEDIUM", voter_id=voter["id"], ip=ip)
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    e = await get_election(body.election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    elig = await evaluate(voter, e)
    if not elig["allowed"] and elig["reason"] != "ALREADY_VOTED":
        raise HTTPException(status_code=403, detail=elig["message"])

    session = {
        "id": new_id(),
        "voter_id": voter["id"],
        "election_id": e["id"],
        "status": "ACTIVE",
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(minutes=SESSION_TTL_MINUTES),
        "ip_address": ip,
    }
    await db.voting_sessions.insert_one(session)
    await record_audit("VOTING_SESSION_OPENED", "voting_session", session["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request,
                       metadata={"election_id": e["id"]})
    return {"session_id": session["id"], "election_id": e["id"], "status": "ACTIVE",
            "expires_at": session["expires_at"], "eligibility": elig}


@router.get("/voting/eligibility/{election_id}")
async def voting_eligibility(election_id: str, request: Request):
    voter = await require_voter(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    return await evaluate(voter, e)


@router.post("/voting/cast")
async def cast_vote(request: Request, body: VoteCastIn,
                    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    voter = await require_voter(request)
    ip = request.client.host if request.client else "unknown"
    if not hit(f"cast:{voter['id']}", 10, 60):
        await record_security_event("RATE_LIMITED", "MEDIUM", voter_id=voter["id"], ip=ip)
        await evaluate_risk(voter["id"], "RATE_LIMITED", ip)
        raise HTTPException(status_code=429, detail="Too many vote requests. Please wait a minute.")
    if not body.confirm:
        raise HTTPException(status_code=400, detail="The vote must be explicitly confirmed on the review screen.")

    e = await get_election(body.election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")

    # Idempotent replay: the same key returns the original receipt, never a second vote.
    if idempotency_key:
        replay = await db.voting_marks.find_one(
            {"voter_id": voter["id"], "idempotency_key": idempotency_key})
        if replay:
            receipt = await db.vote_receipts.find_one({"id": replay["receipt_id"]})
            if receipt:
                return _receipt_out(receipt)

    # 1) voting session must be active, unexpired and belong to this voter + election
    session = await db.voting_sessions.find_one(
        {"id": body.voting_session_id, "voter_id": voter["id"]})
    if not session or session.get("election_id") != e["id"]:
        raise HTTPException(status_code=400,
                            detail="Your voting session is invalid. Start again from the election page.")
    if session["status"] != "ACTIVE" or expired(session.get("expires_at")):
        raise HTTPException(status_code=409, detail="Your voting session has expired. Start again from the election page.")

    # 2) eligibility engine — full re-run server-side
    elig = await evaluate(voter, e)
    if not elig["allowed"]:
        raise HTTPException(status_code=403, detail=elig["message"])

    # 3) candidate must be valid, active and on this election's ballot
    candidate = await db.candidates.find_one({"id": body.candidate_id, "election_id": e["id"]})
    if not candidate or candidate.get("status") != "ACTIVE":
        await record_security_event("INVALID_CANDIDATE", "LOW", voter_id=voter["id"], ip=ip,
                                    metadata={"election_id": e["id"]})
        raise HTTPException(status_code=400,
                            detail="The selected candidate is not on the ballot for this election.")

    # 4) encrypted ballot + commitment — the choice is never stored in readable form
    encrypted_choice = encrypt_ballot({
        "candidate_id": candidate["id"],
        "candidate_name": candidate["name"],
        "party": candidate["party"],
        "election_id": e["id"],
        "cast_at": now_utc().isoformat(),
        "nonce": new_id(),
    })
    ballot_token = new_id()
    receipt_id = f"RCPT-{new_id().replace('-', '').upper()[:12]}"
    commitment = sha256_hex(f"{ballot_token}:{encrypted_choice}:{e['id']}")

    # 5) ATOMIC double-vote lock — the unique (election_id, voter_id) index decides.
    mark = {
        "id": new_id(),
        "election_id": e["id"],
        "voter_id": voter["id"],
        "constituency_id": voter.get("constituency_id"),
        "receipt_id": receipt_id,
        "ballot_token_hash": sha256_hex(ballot_token),
        "idempotency_key": idempotency_key or new_id(),
        "status": "CAST",
        "voted_at": now_utc(),
    }
    try:
        await db.voting_marks.insert_one(mark)
    except DuplicateKeyError:
        existing = await db.voting_marks.find_one({"election_id": e["id"], "voter_id": voter["id"]})
        if (existing and idempotency_key
                and existing.get("idempotency_key") == idempotency_key):
            receipt = await db.vote_receipts.find_one({"id": existing["receipt_id"]})
            if receipt:
                return _receipt_out(receipt)  # resume an interrupted first attempt
            mark = existing  # partial write from an earlier failed attempt — resume it
        else:
            await record_security_event("DUPLICATE_VOTE_ATTEMPT", "MEDIUM",
                                        voter_id=voter["id"], ip=ip,
                                        metadata={"election_id": e["id"]})
            await evaluate_risk(voter["id"], "DUPLICATE_VOTE_ATTEMPT", ip)
            await record_audit("DUPLICATE_VOTE_ATTEMPT", "ballot", e["id"], actor_id=voter["id"],
                               actor_role="VOTER", request=request, result="rejected",
                               metadata={"election_id": e["id"]})
            raise HTTPException(status_code=409,
                                detail="Another voting request is already being processed, or a vote has "
                                       "already been recorded for your account in this election.")

    ballot_id = new_id()
    try:
        ballot = {
            "id": ballot_id,
            "receipt_id": receipt_id,
            "ballot_token": ballot_token,
            "election_id": e["id"],
            "constituency_id": voter.get("constituency_id"),
            "encrypted_choice": encrypted_choice,
            "commitment": commitment,
            "status": "VALID",
            "created_at": now_utc(),
        }
        await db.ballot_records.insert_one(ballot)
        receipt = {
            "id": receipt_id,
            "election_id": e["id"],
            "commitment": commitment,
            "block_index": None,
            "created_at": now_utc(),
        }
        await db.vote_receipts.insert_one(receipt)
        await db.voting_sessions.update_one({"id": session["id"]},
                                            {"$set": {"status": "COMPLETED"}})
    except Exception:
        # ROLLBACK — no partial votes (spec §40). The mark is released so the voter can retry.
        await db.voting_marks.delete_one({"id": mark["id"], "receipt_id": receipt_id})
        await db.ballot_records.delete_one({"id": ballot_id})
        await db.vote_receipts.delete_one({"id": receipt_id})
        await record_audit("VOTE_CAST_FAILED", "ballot", receipt_id, actor_id=voter["id"],
                           actor_role="VOTER", request=request, result="failure",
                           metadata={"election_id": e["id"]})
        raise HTTPException(status_code=500,
                            detail="The vote could not be completed. Nothing was recorded — please retry.")

    block = await append_block("VOTE_COMMITMENT", election_id=e["id"], record_hash=commitment,
                               metadata={"receipt_id": receipt_id,
                                         "constituency_id": voter.get("constituency_id")})
    await db.vote_receipts.update_one({"id": receipt_id}, {"$set": {"block_index": block["index"]}})
    await record_audit("VOTE_CAST", "ballot", ballot_id, actor_id=voter["id"], actor_role="VOTER",
                       request=request,
                       metadata={"election_id": e["id"], "receipt_id": receipt_id,
                                 "commitment": commitment})
    await notify_safe(voter, e, receipt_id)

    out = _receipt_out({**receipt, "block_index": block["index"]})
    return out


async def notify_safe(voter: dict, election: dict, receipt_id: str) -> None:
    from lib.providers import notify_email
    try:
        await notify_email(voter["email"], "Vote recorded",
                           f"Your vote for '{election['name']}' was recorded. Receipt: {receipt_id}. "
                           "The receipt never reveals your candidate choice. (Sandbox notification)")
    except Exception:
        pass


@router.get("/voting/receipt/{receipt_id}")
async def get_receipt(receipt_id: str, request: Request):
    voter = await require_voter(request)
    mark = await db.voting_marks.find_one({"voter_id": voter["id"], "receipt_id": receipt_id})
    if not mark:
        raise HTTPException(status_code=404, detail="No receipt with this ID exists for your account.")
    receipt = await db.vote_receipts.find_one({"id": receipt_id})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found.")
    return _receipt_out(receipt)


@router.get("/voting/verify/{receipt_id}")
async def verify_receipt(receipt_id: str, request: Request):
    """Prove the ballot was recorded — without revealing the choice (spec §31)."""
    voter = await require_voter(request)
    mark = await db.voting_marks.find_one({"voter_id": voter["id"], "receipt_id": receipt_id})
    if not mark:
        raise HTTPException(status_code=404,
                            detail="No ballot record is associated with this receipt for your account.")
    ballot = await db.ballot_records.find_one({"receipt_id": receipt_id})
    receipt = await db.vote_receipts.find_one({"id": receipt_id})
    if not ballot or not receipt or ballot["commitment"] != receipt["commitment"]:
        return {"status": "NOT_VERIFIED", "receipt_id": receipt_id,
                "detail": "The ballot commitment could not be matched for this receipt."}
    block = await db.blockchain_blocks.find_one({"record_hash": ballot["commitment"]})
    if not block:
        return {"status": "NOT_VERIFIED", "receipt_id": receipt_id,
                "detail": "The ballot commitment is not anchored in the ledger."}
    chain = await verify_chain()
    return {
        "status": "BALLOT RECORD VERIFIED",
        "receipt_id": receipt_id,
        "election_id": receipt["election_id"],
        "commitment": receipt["commitment"],
        "block_index": block["index"],
        "block_hash": block["current_hash"],
        "recorded_at": receipt["created_at"],
        "chain_valid": chain["valid"],
        # Deliberately no candidate information anywhere in this response.
    }


@router.get("/voting/receipts")
async def list_my_receipts(request: Request):
    """The voter's own receipts — commitment metadata only, never a choice."""
    voter = await require_voter(request)
    marks = await db.voting_marks.find({"voter_id": voter["id"]}) \
        .sort([("voted_at", -1)]).to_list(50)
    out = []
    for m in marks:
        r = await db.vote_receipts.find_one({"id": m["receipt_id"]})
        if r:
            out.append(_receipt_out(r))
    return out


# ------------------------------------------------------------------ admin monitor


@router.get("/admin/voting/monitor")
async def voting_monitor(request: Request):
    await require_permission("monitor:view")(request)
    recent_marks = await db.voting_marks.find({}).sort([("voted_at", -1)]).to_list(100)
    active_sessions = await db.voting_sessions.count_documents(
        {"status": "ACTIVE", "expires_at": {"$gte": now_utc()}})
    total_votes = await db.voting_marks.count_documents({})
    by_constituency: dict[str, int] = {}
    by_hour: dict[str, int] = {}
    for m in await db.voting_marks.find({}).to_list(20000):
        cid = m.get("constituency_id") or "unknown"
        by_constituency[cid] = by_constituency.get(cid, 0) + 1
        hour = m["voted_at"].strftime("%Y-%m-%d %H:00")
        by_hour[hour] = by_hour.get(hour, 0) + 1
    return {
        "total_votes": total_votes,
        "active_sessions": active_sessions,
        "recent_votes": [{"receipt_id": m["receipt_id"], "election_id": m["election_id"],
                          "constituency_id": m.get("constituency_id"), "voted_at": m["voted_at"],
                          "status": m["status"]} for m in recent_marks],
        "votes_by_constituency": by_constituency,
        "votes_by_hour": [{"hour": k, "votes": v} for k, v in sorted(by_hour.items())[-24:]],
    }
