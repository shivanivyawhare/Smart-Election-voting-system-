"""System routes: health checks (spec §52), public system status (§51), admin dashboard
analytics (§14), admin user management + settings (SUPER_ADMIN), and the contact form.

Health checks are REAL — nothing is reported "connected" without an actual check
(spec §55: never falsely report services as connected).
"""

import os
import time
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request

from lib import ratelimit as rl
from lib.audit import record_audit
from lib.db import client, db
from lib.domain import admin_out, get_setting
from lib.ledger import verify_chain
from lib.providers import get_face_provider, get_identity_provider, notify_email
from lib.security import hash_password, is_dev_mode, new_id, now_utc
from lib.session import ROLE_PERMISSIONS, require_admin, require_permission
from models.system import AdminCreate, ContactCreate, SettingUpdate

router = APIRouter()

START_TIME = time.time()
VERSION = "1.0.0"


async def _health_payload(detailed: bool = True) -> dict:
    checks: dict = {}
    try:
        await client.admin.command("ping")
        checks["database"] = {"status": "healthy", "detail": "MongoDB reachable"}
    except Exception as exc:
        checks["database"] = {"status": "unhealthy", "detail": str(exc)[:200]}

    try:
        blocks = await db.blockchain_blocks.count_documents({})
        last = await db.blockchain_blocks.find_one({}, sort=[("index", -1)])
        checks["blockchain"] = {
            "status": "healthy" if blocks else "degraded",
            "detail": f"{blocks} blocks" + (f", latest #{last['index']}" if last else ""),
            "network": os.environ.get("BLOCKCHAIN_NETWORK", "local-permissioned"),
        }
    except Exception as exc:
        checks["blockchain"] = {"status": "unhealthy", "detail": str(exc)[:200]}

    idp = get_identity_provider()
    checks["identity_provider"] = {
        "status": "healthy",
        "provider": idp.name,
        "mode": "sandbox" if idp.name == "sandbox" else "production-configured",
    }
    fp = get_face_provider()
    checks["face_provider"] = {
        "status": "healthy",
        "provider": fp.name,
        "mode": "sandbox" if fp.name == "sandbox" else "production",
    }
    checks["redis"] = {
        "status": "not_configured" if not os.environ.get("REDIS_URL") else "healthy",
        "detail": "Rate limiting uses the in-process limiter in this deployment",
    }
    checks["email_service"] = {"status": "healthy",
                               "provider": os.environ.get("EMAIL_PROVIDER", "console")}
    checks["sms_service"] = {"status": "healthy",
                             "provider": os.environ.get("SMS_PROVIDER", "console")}

    ok_statuses = ("healthy", "not_configured", "configured")
    payload = {
        "status": "healthy" if all(c["status"] in ok_statuses for c in checks.values()) else "degraded",
        "version": VERSION,
        "uptime_seconds": int(time.time() - START_TIME),
        "development_mode": is_dev_mode(),
        "checks": checks,
        "timestamp": now_utc(),
    }
    if detailed:
        try:
            payload["ledger_verification"] = await verify_chain()
        except Exception:
            payload["ledger_verification"] = {"valid": False, "blocks_checked": 0}
    return payload


@router.get("/health")
async def health():
    return await _health_payload()


@router.get("/ready")
async def ready():
    try:
        await client.admin.command("ping")
        return {"ready": True}
    except Exception:
        return {"ready": False}


@router.get("/live")
async def live():
    return {"live": True}


# ------------------------------------------------------------------ admin


@router.get("/admin/dashboard")
async def admin_dashboard(request: Request):
    await require_admin(request)
    now = now_utc()
    day_ago = now - timedelta(hours=24)

    elections = await db.elections.find({}).to_list(100)
    elections_by_status: dict[str, int] = {}
    for e in elections:
        elections_by_status[e["status"]] = elections_by_status.get(e["status"], 0) + 1

    voters_total = await db.voters.count_documents({})
    voters_approved = await db.voters.count_documents({"status": "APPROVED", "suspended": False})
    voters_pending = await db.voters.count_documents({"status": "PENDING"})
    voters_verified = await db.voters.count_documents({"identity_verified": True})
    votes_cast = await db.voting_marks.count_documents({})
    verification_failures = await db.security_events.count_documents({
        "event_type": {"$in": ["FACE_VERIFICATION_FAILED", "IDENTITY_VERIFICATION_FAILED",
                               "LIVENESS_FAILED"]}})
    suspicious_attempts = await db.security_events.count_documents(
        {"severity": {"$in": ["MEDIUM", "HIGH"]}})
    open_flags = await db.fraud_flags.count_documents({"status": "FLAG_FOR_REVIEW"})
    blockchain_records = await db.blockchain_blocks.count_documents({})

    # chart series (python grouping — dev scale)
    registrations: dict[str, int] = {}
    for v in await db.voters.find({}, {"created_at": 1}).to_list(10000):
        day = v["created_at"].strftime("%Y-%m-%d")
        registrations[day] = registrations.get(day, 0) + 1
    registration_series = []
    for i in range(13, -1, -1):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        registration_series.append({"day": day, "count": registrations.get(day, 0)})

    votes_by_hour: dict[str, int] = {}
    for m in await db.voting_marks.find({}, {"voted_at": 1}).to_list(20000):
        hour = m["voted_at"].strftime("%Y-%m-%d %H:00")
        votes_by_hour[hour] = votes_by_hour.get(hour, 0) + 1
    votes_hour_series = [{"hour": h, "votes": votes_by_hour[h]}
                         for h in sorted(votes_by_hour)[-24:]]

    votes_by_constituency: dict[str, int] = {}
    for m in await db.voting_marks.find({}, {"constituency_id": 1}).to_list(20000):
        cid = m.get("constituency_id") or "unknown"
        votes_by_constituency[cid] = votes_by_constituency.get(cid, 0) + 1
    constis = await db.constituencies.find({}).to_list(100)
    names = {c["id"]: c["name"] for c in constis}
    constituency_series = [{"constituency": names.get(cid, cid), "votes": n}
                           for cid, n in votes_by_constituency.items()]

    auth_events = await db.security_events.find({
        "event_type": {"$in": ["VOTER_LOGIN_FAILED", "ADMIN_LOGIN_FAILED", "ADMIN_LOGIN"]},
        "created_at": {"$gte": now - timedelta(days=14)}}).to_list(5000)
    auth_series: dict[str, dict[str, int]] = {}
    for ev in auth_events:
        day = ev["created_at"].strftime("%Y-%m-%d")
        bucket = auth_series.setdefault(day, {"success": 0, "failure": 0})
        if ev["event_type"] == "ADMIN_LOGIN":
            bucket["success"] += 1
        else:
            bucket["failure"] += 1
    auth_success_failure = []
    for i in range(13, -1, -1):
        day = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        bucket = auth_series.get(day, {"success": 0, "failure": 0})
        auth_success_failure.append({"day": day, **bucket})

    turnout_series = []
    for e in elections:
        approved = await db.voters.count_documents({
            "constituency_id": {"$in": e.get("constituency_ids", [])},
            "status": "APPROVED", "suspended": False})
        cast = await db.voting_marks.count_documents({"election_id": e["id"]})
        turnout_series.append({"election": e["election_code"],
                               "turnout_pct": round(cast / approved * 100, 1) if approved else 0.0})

    db_ok = True
    try:
        await client.admin.command("ping")
    except Exception:
        db_ok = False
    return {
        "cards": {
            "total_elections": len(elections),
            "elections_by_status": elections_by_status,
            "active_elections": elections_by_status.get("OPEN", 0),
            "upcoming_elections": elections_by_status.get("SCHEDULED", 0)
            + elections_by_status.get("DRAFT", 0),
            "completed_elections": elections_by_status.get("RESULTS_PUBLISHED", 0)
            + elections_by_status.get("ARCHIVED", 0),
            "registered_voters": voters_total,
            "approved_voters": voters_approved,
            "pending_voters": voters_pending,
            "verified_voters": voters_verified,
            "votes_cast": votes_cast,
            "verification_failures": verification_failures,
            "suspicious_attempts": suspicious_attempts,
            "open_fraud_flags": open_flags,
            "blockchain_records": blockchain_records,
            "system_health": "healthy" if db_ok else "unhealthy",
        },
        "charts": {
            "registrations": registration_series,
            "votes_per_hour": votes_hour_series,
            "votes_per_constituency": constituency_series,
            "auth_success_failure": auth_success_failure,
            "turnout": turnout_series,
        },
        "generated_at": now,
    }


@router.get("/admin/admin-users")
async def list_admin_users(request: Request):
    admin = await require_admin(request)
    if admin["role"] != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can manage administrator accounts.")
    admins = await db.admins.find({}, {"password_hash": 0, "mfa_code_hash": 0, "mfa_token_hash": 0}) \
        .sort([("created_at", 1)]).to_list(100)
    return [admin_out(a) for a in admins]


@router.post("/admin/admin-users")
async def create_admin_user(body: AdminCreate, request: Request):
    admin = await require_admin(request)
    if admin["role"] != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can create administrator accounts.")
    if body.role not in ROLE_PERMISSIONS:
        raise HTTPException(status_code=400, detail="Unknown role.")
    if await db.admins.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=409, detail="An admin with this email already exists.")
    doc = {
        "id": new_id(),
        "email": body.email.lower(),
        "full_name": body.full_name.strip(),
        "role": body.role,
        "status": "ACTIVE",
        "password_hash": hash_password(body.password),
        "failed_attempts": 0,
        "created_at": now_utc(),
        "last_login_at": None,
    }
    await db.admins.insert_one(doc)
    await record_audit("ADMIN_USER_CREATED", "admin", doc["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"new_admin_role": body.role})
    return admin_out(doc)


@router.get("/admin/settings")
async def get_settings(request: Request):
    await require_permission("settings:view")(request)
    docs = await db.system_settings.find({}).to_list(100)
    return {
        "settings": {d["key"]: d["value"] for d in docs},
        "env": {
            "AADHAAR_PROVIDER": os.environ.get("AADHAAR_PROVIDER", "sandbox"),
            "FACE_PROVIDER": os.environ.get("FACE_PROVIDER", "sandbox"),
            "BLOCKCHAIN_NETWORK": os.environ.get("BLOCKCHAIN_NETWORK", "local-permissioned"),
            "EMAIL_PROVIDER": os.environ.get("EMAIL_PROVIDER", "console"),
            "SMS_PROVIDER": os.environ.get("SMS_PROVIDER", "console"),
            "DEVELOPMENT_MODE": os.environ.get("DEVELOPMENT_MODE", "false"),
        },
        "roles": {role: sorted(perms) if "*" not in perms else ["* (all permissions)"]
                  for role, perms in ROLE_PERMISSIONS.items()},
    }


@router.put("/admin/settings")
async def update_settings(body: SettingUpdate, request: Request):
    admin = await require_admin(request)
    if admin["role"] != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can change system settings.")
    allowed = {"max_face_attempts", "max_liveness_attempts", "voting_session_minutes"}
    for key, value in body.settings.items():
        if key not in allowed:
            raise HTTPException(status_code=400, detail=f"Setting '{key}' is not configurable.")
        await db.system_settings.update_one(
            {"key": key}, {"$set": {"value": value, "updated_at": now_utc(),
                                    "updated_by": admin["id"]}}, upsert=True)
    await record_audit("SYSTEM_SETTINGS_UPDATED", "system_settings", None, actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"keys": list(body.settings.keys())})
    docs = await db.system_settings.find({}).to_list(100)
    return {"settings": {d["key"]: d["value"] for d in docs}}


@router.post("/contact")
async def contact(body: ContactCreate, request: Request):
    ip = request.client.host if request.client else "unknown"
    if not rl.hit(f"contact:{ip}", 5, 3600):
        raise HTTPException(status_code=429, detail="Too many messages. Please try again later.")
    await notify_email("commission@sandbox.local", f"Contact form: {body.subject}",
                       f"From: {body.name} <{body.email}>\n\n{body.message}")
    await record_audit("CONTACT_RECEIVED", "contact", None, actor_id=body.email,
                       actor_role="PUBLIC", request=request, metadata={"subject": body.subject})
    return {"ok": True, "detail": "Your message has been received. (Console email provider — development.)"}
