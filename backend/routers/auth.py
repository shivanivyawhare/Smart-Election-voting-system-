"""Authentication routes: voter register / login / refresh / logout and the
admin MFA login (spec §8, §13, §35). Sessions are httpOnly cookies; no token is
ever returned in JSON. Every sensitive step is audited and feeds fraud telemetry."""

import secrets
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Request, Response

from lib.audit import evaluate_risk, record_audit, record_security_event
from lib.db import db
from lib.domain import admin_out, voter_out
from lib.providers import notify_email
from lib.ratelimit import hit
from lib.security import (decode_refresh, expired, hash_password, in_future,
                          is_dev_mode, new_id, now_utc, sha256_hex, verify_password)
from lib.session import (clear_session_cookies, get_current_admin, get_current_voter,
                         set_session_cookies)
from models.system import AdminLogin, MfaVerify
from models.users import AdminLoginStep1Out, AuthMe, VoterLogin, VoterRegister

router = APIRouter()

MAX_ADMIN_FAILED_ATTEMPTS = 5
ADMIN_LOCKOUT_MINUTES = 15


def _auth_me(role_type: str | None, user: dict | None) -> dict:
    return {"authenticated": role_type is not None, "role_type": role_type, "user": user}


# ------------------------------------------------------------------ voter


@router.post("/auth/register")
async def register_voter(body: VoterRegister, request: Request, response: Response):
    ip = request.client.host if request.client else "unknown"
    if not hit(f"register:{ip}", 10, 3600):
        await record_security_event("RATE_LIMITED", "MEDIUM", ip=ip, metadata={"path": "/auth/register"})
        raise HTTPException(status_code=429, detail="Too many registration attempts. Please try again later.")

    try:
        dob = date.fromisoformat(body.date_of_birth)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date of birth must be a valid date (YYYY-MM-DD).")
    if dob > date.today() or (date.today() - dob).days < 18 * 365:
        raise HTTPException(status_code=400, detail="You must be at least 18 years old to register.")

    constituency = await db.constituencies.find_one({"id": body.constituency_id})
    if not constituency:
        raise HTTPException(status_code=400, detail="Selected constituency does not exist.")
    if await db.voters.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if await db.voters.find_one({"voter_ref": body.voter_ref.upper()}):
        raise HTTPException(status_code=409, detail="This voter reference is already registered.")

    voter = {
        "id": new_id(),
        "full_name": body.full_name.strip(),
        "email": body.email.lower(),
        "mobile": body.mobile,
        "date_of_birth": body.date_of_birth,
        "state": body.state.strip(),
        "district": body.district.strip(),
        "constituency_id": body.constituency_id,
        "voter_ref": body.voter_ref.upper(),
        "voter_ref_masked": None,  # computed on read; the raw ref is registration data, never displayed
        "password_hash": hash_password(body.password),
        "status": "PENDING",
        "suspended": False,
        "identity_verified": False,
        "face_verified": False,
        "liveness_verified": False,
        "identity_masked": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.voters.insert_one(voter)
    await record_audit("VOTER_REGISTERED", "voter", voter["id"], actor_id=voter["id"],
                       actor_role="VOTER", request=request,
                       metadata={"constituency_id": body.constituency_id})
    await notify_email(voter["email"], "Registration received",
                       "Your voter registration was received and is awaiting administrator approval. "
                       "This is a DEVELOPMENT/SANDBOX notification.")
    set_session_cookies(response, voter["id"], "voter")
    return _auth_me("voter", voter_out(voter))


@router.post("/auth/login")
async def voter_login(body: VoterLogin, request: Request, response: Response):
    ip = request.client.host if request.client else "unknown"
    if not hit(f"vlogin:{ip}", 10, 300) or not hit(f"vlogin:email:{body.email.lower()}", 8, 300):
        await record_security_event("RATE_LIMITED", "MEDIUM", ip=ip, metadata={"path": "/auth/login"})
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Please wait a few minutes.")

    voter = await db.voters.find_one({"email": body.email.lower()})
    if not voter or not verify_password(body.password, voter.get("password_hash", "")):
        await record_security_event("VOTER_LOGIN_FAILED", "LOW",
                                    voter_id=voter["id"] if voter else None, ip=ip)
        if voter:
            await evaluate_risk(voter["id"], "VOTER_LOGIN_FAILED", ip)
        await record_audit("VOTER_LOGIN", "voter", body.email, actor_id=body.email,
                           actor_role="VOTER", request=request, result="failure")
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if voter.get("suspended") or voter.get("status") == "SUSPENDED":
        raise HTTPException(status_code=403, detail="This voter account is suspended. Contact the election commission.")

    set_session_cookies(response, voter["id"], "voter")
    await record_audit("VOTER_LOGIN", "voter", voter["id"], actor_id=voter["id"],
                       actor_role="VOTER", request=request)
    return _auth_me("voter", voter_out(voter))


@router.get("/auth/me")
async def auth_me(request: Request):
    voter = await get_current_voter(request)
    if voter:
        return _auth_me("voter", voter_out(voter))
    admin = await get_current_admin(request)
    if admin:
        return _auth_me("admin", admin_out(admin))
    return _auth_me(None, None)


@router.post("/auth/refresh")
async def refresh_session(request: Request, response: Response):
    from lib.security import REFRESH_COOKIE
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    payload = decode_refresh(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    stored = await db.refresh_tokens.find_one_and_delete({"jti": payload["jti"]})
    if not stored:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    typ = payload.get("token_typ", "voter")
    if typ == "admin":
        admin = await db.admins.find_one({"id": payload["sub"]})
        if not admin:
            raise HTTPException(status_code=401, detail="Session is no longer valid.")
        set_session_cookies(response, admin["id"], "admin", admin["role"])
        return _auth_me("admin", admin_out(admin))
    voter = await db.voters.find_one({"id": payload["sub"]})
    if not voter:
        raise HTTPException(status_code=401, detail="Session is no longer valid.")
    set_session_cookies(response, voter["id"], "voter")
    return _auth_me("voter", voter_out(voter))


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    from lib.security import REFRESH_COOKIE
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        payload = decode_refresh(token)
        if payload:
            await db.refresh_tokens.delete_one({"jti": payload["jti"]})
            await record_audit("LOGOUT", payload.get("token_typ", "voter"), payload["sub"],
                               actor_id=payload["sub"], actor_role=payload.get("token_typ", "voter").upper(),
                               request=request)
    clear_session_cookies(response)
    return {"ok": True}


# ------------------------------------------------------------------ admin


@router.post("/auth/admin/login")
async def admin_login_step1(body: AdminLogin, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not hit(f"alogin:{ip}", 8, 300) or not hit(f"alogin:email:{body.email.lower()}", 8, 300):
        await record_security_event("RATE_LIMITED", "MEDIUM", ip=ip, metadata={"path": "/auth/admin/login"})
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Please wait a few minutes.")

    admin = await db.admins.find_one({"email": body.email.lower()})
    if not admin or not verify_password(body.password, admin.get("password_hash", "")):
        await record_security_event("ADMIN_LOGIN_FAILED", "MEDIUM",
                                    voter_id=admin["id"] if admin else None, ip=ip)
        if admin:
            await evaluate_risk(admin["id"], "ADMIN_LOGIN_FAILED", ip)
        await record_audit("ADMIN_LOGIN", "admin", body.email, actor_id=body.email,
                           actor_role="ADMIN", request=request, result="failure")
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if in_future(admin.get("locked_until")):
        from lib.security import normalize_dt
        minutes = max(1, int((normalize_dt(admin["locked_until"]) - now_utc()).total_seconds() // 60) + 1)
        raise HTTPException(status_code=423,
                            detail=f"Account locked after repeated failures. Try again in {minutes} minute(s).")
    if admin.get("status") != "ACTIVE":
        raise HTTPException(status_code=403, detail="This administrator account is disabled.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    mfa_token = secrets.token_urlsafe(24)
    await db.admins.update_one({"id": admin["id"]}, {
        "$set": {
            "mfa_token_hash": sha256_hex(mfa_token),
            "mfa_code_hash": sha256_hex(code),
            "mfa_expires_at": now_utc() + timedelta(minutes=5),
        }
    })
    await record_audit("ADMIN_MFA_ISSUED", "admin", admin["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request)
    await notify_email(admin["email"], "MFA code issued",
                       "A 6-digit MFA code was issued for your admin account. "
                       "In development it is delivered via the console provider.")
    return AdminLoginStep1Out(
        mfa_required=True,
        mfa_token=mfa_token,
        sandbox_code=code if is_dev_mode() else None,
    )


@router.post("/auth/admin/mfa")
async def admin_login_mfa(body: MfaVerify, request: Request, response: Response):
    ip = request.client.host if request.client else "unknown"
    admin = await db.admins.find_one({"mfa_token_hash": sha256_hex(body.mfa_token)})
    if not admin or not admin.get("mfa_expires_at"):
        raise HTTPException(status_code=401, detail="This MFA request is invalid or has expired. Start again.")
    if expired(admin.get("mfa_expires_at")):
        raise HTTPException(status_code=401, detail="This MFA code has expired. Start again.")
    if sha256_hex(body.code) != admin.get("mfa_code_hash"):
        await record_security_event("ADMIN_MFA_FAILED", "MEDIUM", voter_id=admin["id"], ip=ip)
        failed = admin.get("mfa_attempts", 0) + 1
        await db.admins.update_one({"id": admin["id"]}, {"$set": {"mfa_attempts": failed}})
        if failed >= 5:
            await db.admins.update_one(
                {"id": admin["id"]},
                {"$set": {"locked_until": now_utc() + timedelta(minutes=ADMIN_LOCKOUT_MINUTES),
                          "mfa_token_hash": None, "mfa_code_hash": None}})
            await record_security_event("ADMIN_ACCOUNT_LOCKED", "HIGH", voter_id=admin["id"], ip=ip)
        raise HTTPException(status_code=401, detail="Invalid MFA code. Check the code and try again.")

    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"mfa_token_hash": None, "mfa_code_hash": None, "mfa_attempts": 0,
                  "failed_attempts": 0, "last_login_at": now_utc(),
                  "last_login_ip": ip}})
    await record_security_event("ADMIN_LOGIN", "INFO", voter_id=admin["id"], ip=ip,
                                metadata={"method": "password+mfa"})
    await record_audit("ADMIN_LOGIN", "admin", admin["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request)
    set_session_cookies(response, admin["id"], "admin", admin["role"])
    return _auth_me("admin", admin_out(admin))


@router.post("/auth/admin/logout")
async def admin_logout(request: Request, response: Response):
    admin = await get_current_admin(request)
    if admin:
        await record_audit("ADMIN_LOGOUT", "admin", admin["id"], actor_id=admin["id"],
                           actor_role=admin.get("role", "ADMIN"), request=request)
    clear_session_cookies(response)
    return {"ok": True}
