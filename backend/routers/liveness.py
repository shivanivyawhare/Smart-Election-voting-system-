"""Liveness detection routes (spec §10).

The challenge sequence is generated server-side with a per-session nonce and expiry.
Submitted frames are compared pairwise (photo replay submits identical frames), scored,
and then discarded. Suspicious attempts feed the fraud monitor.
"""

import hashlib
import random
import secrets
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request

from lib.audit import evaluate_risk, record_audit, record_security_event
from lib.capture import data_url_to_bytes
from lib.db import db
from lib.ratelimit import hit
from lib.security import expired, is_dev_mode, new_id, now_utc, sha256_hex
from lib.session import require_voter
from models.voting import LivenessVerifyIn
from pydantic import BaseModel

router = APIRouter()


class LivenessChallengeIn(BaseModel):
    session_id: str


CHALLENGE_POOL = ["BLINK", "TURN_HEAD_LEFT", "TURN_HEAD_RIGHT", "LOOK_UP", "SMILE"]
CHALLENGE_LABELS = {
    "BLINK": "Blink slowly, twice",
    "TURN_HEAD_LEFT": "Turn your head to the left",
    "TURN_HEAD_RIGHT": "Turn your head to the right",
    "LOOK_UP": "Look up towards the ceiling",
    "SMILE": "Smile",
}
SESSION_TTL_SECONDS = 120
MAX_ATTEMPTS = 3


@router.post("/liveness/start")
async def start_liveness(request: Request):
    voter = await require_voter(request)
    if not voter.get("face_verified"):
        raise HTTPException(status_code=400,
                            detail="Complete face verification before the liveness check.")
    challenges = random.sample(CHALLENGE_POOL, 3)
    session = {
        "id": new_id(),
        "voter_id": voter["id"],
        "status": "ACTIVE",
        "challenges": challenges,
        "nonce": secrets.token_urlsafe(16),
        "attempts": 0,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(seconds=SESSION_TTL_SECONDS),
    }
    await db.liveness_sessions.insert_one(session)
    await record_audit("LIVENESS_STARTED", "liveness_session", session["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request)
    return {
        "session_id": session["id"],
        "nonce": session["nonce"],
        "challenges": [{"code": c, "label": CHALLENGE_LABELS[c]} for c in challenges],
        "expires_at": session["expires_at"],
    }


@router.post("/liveness/challenge")
async def current_challenge(body: LivenessChallengeIn, request: Request):
    voter = await require_voter(request)
    session = await db.liveness_sessions.find_one({"id": body.session_id, "voter_id": voter["id"]})
    if not session:
        raise HTTPException(status_code=404, detail="Liveness session not found.")
    if session["status"] != "ACTIVE" or expired(session.get("expires_at")):
        raise HTTPException(status_code=400, detail="This liveness session has expired. Restart the check.")
    return {
        "session_id": session["id"],
        "challenges": [{"code": c, "label": CHALLENGE_LABELS[c]} for c in session["challenges"]],
        "expires_at": session["expires_at"],
    }


@router.post("/liveness/verify")
async def verify_liveness(body: LivenessVerifyIn, request: Request):
    voter = await require_voter(request)
    ip = request.client.host if request.client else "unknown"
    if not hit(f"liveness:{voter['id']}", 20, 300):
        await record_security_event("RATE_LIMITED", "MEDIUM", voter_id=voter["id"], ip=ip)
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes.")

    session = await db.liveness_sessions.find_one({"id": body.session_id, "voter_id": voter["id"]})
    if not session:
        raise HTTPException(status_code=404, detail="Liveness session not found.")
    if session["status"] == "VERIFIED":
        raise HTTPException(status_code=409, detail="This liveness check is already verified.")
    if session["status"] != "ACTIVE" or expired(session.get("expires_at")):
        raise HTTPException(status_code=400, detail="This liveness session has expired. Restart the check.")
    if session.get("attempts", 0) >= MAX_ATTEMPTS:
        await record_security_event("LIVENESS_LOCKED", "HIGH", voter_id=voter["id"])
        await record_audit("LIVENESS_LOCKED", "liveness_session", session["id"],
                           actor_id=voter["id"], actor_role="VOTER", request=request, result="failure")
        return {"status": "LOCKED", "reasons": ["Maximum liveness attempts reached. Contact the election commission."],
                "attempts_remaining": 0, "sandbox": True}

    async def fail(reasons: list[str], severity: str = "MEDIUM"):
        attempts = session.get("attempts", 0) + 1
        status = "LOCKED" if attempts >= MAX_ATTEMPTS else "RETRY_REQUIRED"
        await db.liveness_sessions.update_one(
            {"id": session["id"]},
            {"$set": {"attempts": attempts, "status": status if status == "LOCKED" else "ACTIVE"}})
        await record_security_event("LIVENESS_FAILED", severity, voter_id=voter["id"],
                                    metadata={"reasons": reasons})
        await evaluate_risk(voter["id"], "LIVENESS_FAILED")
        await record_audit("LIVENESS_FAILED", "liveness_session", session["id"],
                           actor_id=voter["id"], actor_role="VOTER", request=request,
                           result="failure", metadata={"reasons": reasons})
        return {"status": status, "reasons": reasons,
                "attempts_remaining": MAX_ATTEMPTS - attempts, "sandbox": True}

    reasons: list[str] = []
    if not secrets.compare_digest(body.nonce, session["nonce"]):
        return await fail(["Challenge nonce mismatch — possible replay. Restart the check."], "HIGH")
    if len(body.frames) != len(session["challenges"]):
        return await fail(["Perform every challenge step before submitting."])
    if any(t < 250 for t in body.timings_ms):
        reasons.append("Challenges were completed implausibly fast — possible automation.")

    frame_hashes = []
    for frame in body.frames:
        raw = data_url_to_bytes(frame)
        if raw is None:
            return await fail(["One or more captured frames could not be processed."])
        frame_hashes.append(hashlib.sha256(raw).hexdigest())
    if len(set(frame_hashes)) != len(frame_hashes):
        return await fail(["Identical frames across challenges — possible photo replay."], "HIGH")
    if not is_dev_mode() and any(f.startswith("data:image/svg") for f in body.frames):
        reasons.append("Unsupported frame format.")

    if reasons:
        return await fail(reasons)

    await db.liveness_sessions.update_one(
        {"id": session["id"]}, {"$set": {"status": "VERIFIED", "completed_at": now_utc()}})
    await db.voters.update_one(
        {"id": voter["id"]}, {"$set": {"liveness_verified": True, "updated_at": now_utc()}})
    await record_audit("LIVENESS_VERIFIED", "liveness_session", session["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request,
                       metadata={"challenges": session["challenges"],
                                 "frame_hashes": frame_hashes})
    return {"status": "VERIFIED", "reasons": [],
            "attempts_remaining": MAX_ATTEMPTS - session.get("attempts", 0), "sandbox": True}


@router.get("/liveness/status/{session_id}")
async def liveness_status(session_id: str, request: Request):
    voter = await require_voter(request)
    session = await db.liveness_sessions.find_one({"id": session_id, "voter_id": voter["id"]})
    if not session:
        raise HTTPException(status_code=404, detail="Liveness session not found.")
    return {"session_id": session["id"], "status": session["status"],
            "attempts": session.get("attempts", 0), "expires_at": session["expires_at"],
            "verified": bool(voter.get("liveness_verified"))}
