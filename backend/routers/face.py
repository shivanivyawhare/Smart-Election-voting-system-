"""Face verification routes (spec §9).

Camera captures are analysed for a single verification call and then discarded —
only verification metadata (status, confidence, quality metrics, attempt counts)
is stored. The check anchors to the logged-in voter's own session; faces are never
used to search a database of other voters.
"""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request

from lib.audit import evaluate_risk, record_audit, record_security_event
from lib.capture import data_url_to_bytes
from lib.db import db
from lib.domain import get_setting
from lib.providers import get_face_provider
from lib.ratelimit import hit
from lib.security import expired, is_dev_mode, new_id, now_utc
from lib.session import require_voter
from models.voting import FaceSessionCreate, FaceVerifyIn

router = APIRouter()


@router.post("/face/session")
async def create_face_session(body: FaceSessionCreate, request: Request):
    voter = await require_voter(request)
    session = {
        "id": new_id(),
        "kind": "FACE_SESSION",
        "voter_id": voter["id"],
        "purpose": body.purpose,
        "status": "PENDING",
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(minutes=10),
    }
    await db.face_verifications.insert_one(session)
    return {"session_id": session["id"], "status": "PENDING", "expires_at": session["expires_at"]}


@router.post("/face/verify")
async def verify_face(body: FaceVerifyIn, request: Request):
    voter = await require_voter(request)
    ip = request.client.host if request.client else "unknown"
    if not hit(f"face:{voter['id']}", 20, 300):
        await record_security_event("RATE_LIMITED", "MEDIUM", voter_id=voter["id"], ip=ip)
        raise HTTPException(status_code=429, detail="Too many verification attempts. Please wait a few minutes.")
    if body.simulated and not is_dev_mode():
        raise HTTPException(status_code=400, detail="Simulated captures are only available in development mode.")

    session = await db.face_verifications.find_one(
        {"id": body.session_id, "voter_id": voter["id"]})
    if not session:
        raise HTTPException(status_code=404, detail="Face verification session not found.")
    if session["status"] in ("VERIFIED", "LOCKED"):
        raise HTTPException(status_code=409, detail="This face verification session is already closed.")
    if expired(session.get("expires_at")):
        raise HTTPException(status_code=400, detail="This face verification session has expired. Start again.")

    max_attempts = int(await get_setting("max_face_attempts", "5"))
    used = await db.face_verifications.count_documents({
        "voter_id": voter["id"], "kind": "ATTEMPT",
        "created_at": {"$gte": now_utc() - timedelta(hours=24)}})
    if used >= max_attempts and not voter.get("face_verified"):
        await db.face_verifications.insert_one({
            "id": new_id(), "kind": "ATTEMPT", "voter_id": voter["id"], "session_id": session["id"],
            "status": "LOCKED", "confidence": 0.0, "reasons": ["Daily attempt limit reached"],
            "provider": get_face_provider().name, "simulated": body.simulated,
            "metrics": None, "created_at": now_utc(),
        })
        await record_security_event("FACE_VERIFICATION_LOCKED", "HIGH", voter_id=voter["id"])
        await record_audit("FACE_VERIFICATION_LOCKED", "face_verification", session["id"],
                           actor_id=voter["id"], actor_role="VOTER", request=request, result="failure")
        return {"status": "LOCKED", "confidence": 0.0,
                "reasons": ["Daily attempt limit reached. Contact the election commission."],
                "attempts_remaining": 0, "provider": get_face_provider().name, "sandbox": True}

    image_bytes = data_url_to_bytes(body.image)
    if image_bytes is None:
        raise HTTPException(status_code=400, detail="The captured frame could not be processed. Retry the capture.")

    provider = get_face_provider()
    result = await provider.verify_capture(
        {"brightness": body.brightness, "variance": body.variance,
         "face_confidence": body.face_confidence},
        image_bytes,
    )

    if result["verified"]:
        doc = {
            "id": new_id(), "kind": "ATTEMPT", "voter_id": voter["id"], "session_id": session["id"],
            "status": "VERIFIED", "confidence": result["confidence"], "reasons": [],
            "provider": result["provider"], "simulated": body.simulated,
            "metrics": {"brightness": body.brightness, "variance": body.variance,
                        "face_confidence": body.face_confidence},
            "created_at": now_utc(),
        }
        await db.face_verifications.insert_one(doc)
        await db.face_verifications.update_one(
            {"id": session["id"]}, {"$set": {"status": "VERIFIED"}})
        await db.voters.update_one(
            {"id": voter["id"]}, {"$set": {"face_verified": True, "updated_at": now_utc()}})
        await record_audit("FACE_VERIFIED", "face_verification", doc["id"],
                           actor_id=voter["id"], actor_role="VOTER", request=request,
                           metadata={"confidence": result["confidence"], "provider": result["provider"],
                                     "simulated": body.simulated})
        return {"status": "VERIFIED", "confidence": result["confidence"], "reasons": [],
                "attempts_remaining": max_attempts - used - 1, "provider": result["provider"],
                "sandbox": result["sandbox"]}

    status = "LOCKED" if used + 1 >= max_attempts else "RETRY_REQUIRED"
    doc = {
        "id": new_id(), "kind": "ATTEMPT", "voter_id": voter["id"], "session_id": session["id"],
        "status": status, "confidence": result["confidence"], "reasons": result["reasons"],
        "provider": result["provider"], "simulated": body.simulated,
        "metrics": {"brightness": body.brightness, "variance": body.variance,
                    "face_confidence": body.face_confidence},
        "created_at": now_utc(),
    }
    await db.face_verifications.insert_one(doc)
    await record_security_event("FACE_VERIFICATION_FAILED", "MEDIUM", voter_id=voter["id"],
                                metadata={"reasons": result["reasons"]})
    await evaluate_risk(voter["id"], "FACE_VERIFICATION_FAILED")
    await record_audit("FACE_VERIFICATION_FAILED", "face_verification", doc["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request, result="failure",
                       metadata={"reasons": result["reasons"]})
    if status == "LOCKED":
        await record_security_event("FACE_VERIFICATION_LOCKED", "HIGH", voter_id=voter["id"])
    return {"status": status, "confidence": result["confidence"], "reasons": result["reasons"],
            "attempts_remaining": max_attempts - used - 1, "provider": result["provider"],
            "sandbox": result["sandbox"]}


@router.get("/face/status/{session_id}")
async def face_status(session_id: str, request: Request):
    voter = await require_voter(request)
    session = await db.face_verifications.find_one(
        {"id": session_id, "voter_id": voter["id"]}, {"otp_hash": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Face verification session not found.")
    latest = await db.face_verifications.find_one(
        {"voter_id": voter["id"], "kind": "ATTEMPT", "session_id": session_id},
        sort=[("created_at", -1)])
    return {
        "session_id": session["id"],
        "status": session["status"] if session["status"] != "PENDING"
        and latest is None else (latest or {}).get("status", session["status"]),
        "latest_attempt": None if not latest else {
            "status": latest["status"], "confidence": latest.get("confidence", 0.0),
            "reasons": latest.get("reasons", []), "created_at": latest["created_at"],
        },
        "verified": bool(voter.get("face_verified")),
    }
