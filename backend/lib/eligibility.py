"""Eligibility engine (spec §11).

Before a vote is allowed, EVERY condition must hold. The engine returns a safe,
human-readable reason on denial — never internal details.
"""

from pymongo import ReturnDocument

from lib.audit import record_audit
from lib.db import db
from lib.ledger import append_block
from lib.security import normalize_dt, now_utc

REASON_TEXT = {
    "IDENTITY_NOT_VERIFIED": "Identity verification is not complete. Finish the identity step before voting.",
    "FACE_NOT_VERIFIED": "Face verification is not complete. Finish the face step before voting.",
    "LIVENESS_NOT_VERIFIED": "Liveness detection is not complete. Finish the liveness step before voting.",
    "VOTER_NOT_ACTIVE": "Your voter registration is awaiting administrator approval, or is suspended.",
    "ELECTION_NOT_OPEN": "This election is not currently accepting votes.",
    "ELECTION_NOT_STARTED": "This election has not opened yet.",
    "ELECTION_ENDED": "This election is no longer accepting votes.",
    "NOT_ELIGIBLE": "You are not registered in a constituency assigned to this election.",
    "ALREADY_VOTED": "You have already cast your vote in this election.",
}


async def maybe_auto_close(election: dict) -> dict:
    """Lazy state transition: an OPEN election past its end time closes itself, audited."""
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
        await append_block("ELECTION_CLOSED", election_id=updated["id"],
                           metadata={"auto": True})
    return updated or election


async def evaluate(voter: dict, election: dict) -> dict:
    """Return {allowed, reason, message, checks[]} for this voter/election pair."""
    election = await maybe_auto_close(election)
    now = now_utc()
    start = normalize_dt(election["start_at"])
    end = normalize_dt(election["end_at"])

    checks: list[dict] = []
    checks.append({
        "code": "IDENTITY_VERIFIED", "label": "Identity verified",
        "passed": bool(voter.get("identity_verified")),
    })
    checks.append({
        "code": "FACE_VERIFIED", "label": "Face verified",
        "passed": bool(voter.get("face_verified")),
    })
    checks.append({
        "code": "LIVENESS_VERIFIED", "label": "Liveness verified",
        "passed": bool(voter.get("liveness_verified")),
    })
    checks.append({
        "code": "VOTER_ACTIVE", "label": "Registration approved",
        "passed": voter.get("status") == "APPROVED" and not voter.get("suspended", False),
    })
    if election["status"] == "OPEN":
        if now < start:
            election_ok, code = False, "ELECTION_NOT_STARTED"
        elif now >= end:
            election_ok, code = False, "ELECTION_ENDED"
        else:
            election_ok, code = True, "ELECTION_OPEN"
    else:
        election_ok, code = False, "ELECTION_NOT_OPEN"
    checks.append({"code": "ELECTION_ACTIVE", "label": "Election open", "passed": election_ok})
    checks.append({
        "code": "CONSTITUENCY_ELIGIBLE", "label": "Assigned to this election",
        "passed": voter.get("constituency_id") in election.get("constituency_ids", []),
    })
    mark = await db.voting_marks.find_one(
        {"election_id": election["id"], "voter_id": voter["id"]})
    checks.append({"code": "NOT_ALREADY_VOTED", "label": "No vote cast yet", "passed": mark is None})

    failed = next((c for c in checks if not c["passed"]), None)
    return {
        "allowed": failed is None,
        "reason": "ALLOW_VOTE" if failed is None else failed["code"],
        "message": "You are eligible to vote in this election." if failed is None
        else REASON_TEXT.get(failed["code"], "You cannot vote in this election right now."),
        "checks": [{"code": c["code"], "label": c["label"], "passed": c["passed"]} for c in checks],
        "has_voted": mark is not None,
    }
