"""Identity verification routes (spec §8): consent -> initiate -> OTP verify -> status.

The sandbox OTP is returned to the client ONLY in DEVELOPMENT_MODE and is always
labelled as a sandbox value. The 12-digit reference typed by the user is validated
for format and then discarded — it is never stored, logged or hashed into history.
"""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request

from lib.audit import evaluate_risk, record_audit, record_security_event
from lib.db import db
from lib.providers import (ProviderError, get_identity_provider, notify_email)
from lib.ratelimit import hit
from lib.security import expired, is_dev_mode, new_id, normalize_dt, now_utc, sha256_hex
from lib.session import require_voter
from models.voting import (ConsentCreate, IdentityInitiate, IdentityInitiateOut,
                           IdentityVerifyOtp)

router = APIRouter()

MAX_OTP_ATTEMPTS = 5
CONSENT_MAX_AGE = timedelta(hours=24)


@router.post("/identity/consent")
async def record_consent(body: ConsentCreate, request: Request):
    voter = await require_voter(request)
    consent = {
        "id": new_id(),
        "kind": "CONSENT",
        "voter_id": voter["id"],
        "purpose": body.purpose,
        "provider": get_identity_provider().name,
        "consented_at": now_utc(),
    }
    await db.identity_verifications.insert_one(consent)
    await record_audit("IDENTITY_CONSENT", "identity_verification", consent["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request,
                       metadata={"purpose": body.purpose, "provider": consent["provider"]})
    return {"consent_id": consent["id"], "provider": consent["provider"],
            "sandbox": is_dev_mode()}


@router.post("/identity/initiate")
async def initiate_identity(body: IdentityInitiate, request: Request):
    voter = await require_voter(request)
    ip = request.client.host if request.client else "unknown"
    if not hit(f"identity:{voter['id']}", 10, 300):
        await record_security_event("RATE_LIMITED", "MEDIUM", voter_id=voter["id"], ip=ip)
        raise HTTPException(status_code=429, detail="Too many verification attempts. Please wait a few minutes.")

    consent = await db.identity_verifications.find_one(
        {"id": body.consent_id, "kind": "CONSENT", "voter_id": voter["id"]})
    if not consent:
        raise HTTPException(status_code=400, detail="Consent is required before identity verification.")
    if normalize_dt(consent["consented_at"]) < now_utc() - CONSENT_MAX_AGE:
        raise HTTPException(status_code=400, detail="Your consent has expired. Please accept the consent screen again.")

    provider = get_identity_provider()
    try:
        result = await provider.initiate_authentication(body.aadhaar_ref, body.purpose)
    except ProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    txn = {
        "id": new_id(),
        "kind": "TRANSACTION",
        "voter_id": voter["id"],
        "provider": result["provider"],
        "status": "OTP_SENT",
        "purpose": body.purpose,
        "consent_timestamp": consent["consented_at"],
        "masked_ref": result["masked_ref"],
        "otp_hash": result["otp_hash"],
        "otp_expires_at": result["expires_at"],
        "otp_attempts": 0,
        "risk_score": 0.0,
        "created_at": now_utc(),
        "verified_at": None,
        # The raw reference is deliberately NOT stored anywhere from here on.
    }
    await db.identity_verifications.insert_one(txn)
    await record_audit("IDENTITY_INITIATED", "identity_verification", txn["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request,
                       metadata={"provider": result["provider"], "purpose": body.purpose})
    out = {
        "transaction_id": txn["id"],
        "provider": result["provider"],
        "status": txn["status"],
        "masked_ref": result["masked_ref"],
        "expires_at": result["expires_at"],
        "sandbox_otp": result.get("sandbox_otp"),
        "sandbox_notice": ("SANDBOX: this code is generated locally for development and is NOT a real "
                           "UIDAI verification." if result.get("sandbox_otp") else None),
    }
    return IdentityInitiateOut(**out)


@router.post("/identity/verify-otp")
async def verify_identity_otp(body: IdentityVerifyOtp, request: Request):
    voter = await require_voter(request)
    txn = await db.identity_verifications.find_one(
        {"id": body.transaction_id, "kind": "TRANSACTION", "voter_id": voter["id"]})
    if not txn:
        raise HTTPException(status_code=404, detail="Verification transaction not found.")
    if txn["status"] == "VERIFIED":
        raise HTTPException(status_code=409, detail="This transaction is already verified.")
    if txn["status"] != "OTP_SENT":
        raise HTTPException(status_code=400, detail="This verification transaction is no longer active.")
    if expired(txn.get("otp_expires_at")):
        raise HTTPException(status_code=400, detail="This code has expired. Start the verification again.")
    if txn.get("otp_attempts", 0) >= MAX_OTP_ATTEMPTS:
        await record_security_event("IDENTITY_VERIFICATION_FAILED", "HIGH", voter_id=voter["id"],
                                    metadata={"reason": "max attempts"})
        raise HTTPException(status_code=429, detail="Too many incorrect codes. Start the verification again.")

    if sha256_hex(body.otp) != txn["otp_hash"]:
        await db.identity_verifications.update_one(
            {"id": txn["id"]}, {"$inc": {"otp_attempts": 1}})
        await record_security_event("IDENTITY_VERIFICATION_FAILED", "LOW", voter_id=voter["id"])
        await evaluate_risk(voter["id"], "IDENTITY_VERIFICATION_FAILED")
        await record_audit("IDENTITY_VERIFICATION_FAILED", "identity_verification", txn["id"],
                           actor_id=voter["id"], actor_role="VOTER", request=request, result="failure")
        raise HTTPException(status_code=401, detail="The code is incorrect. Check and try again.")

    provider = get_identity_provider()
    await db.identity_verifications.update_one(
        {"id": txn["id"]},
        {"$set": {"status": "VERIFIED", "verified_at": now_utc(), "risk_score": 0.1}})
    await db.voters.update_one(
        {"id": voter["id"]},
        {"$set": {"identity_verified": True, "identity_masked": txn["masked_ref"],
                  "updated_at": now_utc()}})
    await record_audit("IDENTITY_VERIFIED", "identity_verification", txn["id"],
                       actor_id=voter["id"], actor_role="VOTER", request=request,
                       metadata={"election_id": None, "provider": txn["provider"],
                                 "masked_ref": txn["masked_ref"]})
    await notify_email(voter["email"], "Identity verification completed",
                       "Your identity verification step is complete. This is a sandbox-verified result, "
                       "not a real government verification.")
    return {
        "id": txn["id"],
        "voter_id": voter["id"],
        "provider": txn["provider"],
        "status": "VERIFIED",
        "purpose": txn["purpose"],
        "masked_ref": txn["masked_ref"],
        "consent_timestamp": txn["consent_timestamp"],
        "risk_score": 0.1,
        "created_at": txn["created_at"],
        "verified_at": now_utc(),
    }


@router.get("/identity/status/{transaction_id}")
async def identity_status(transaction_id: str, request: Request):
    voter = await require_voter(request)
    txn = await db.identity_verifications.find_one(
        {"id": transaction_id, "kind": "TRANSACTION", "voter_id": voter["id"]},
        {"otp_hash": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Verification transaction not found.")
    return {
        "transaction_id": txn["id"],
        "status": txn["status"],
        "provider": txn["provider"],
        "masked_ref": txn["masked_ref"],
        "created_at": txn["created_at"],
        "verified_at": txn.get("verified_at"),
    }
