"""Cookie sessions (httpOnly) + RBAC dependencies (spec §13, §35, §36).

Access/refresh JWTs ride httpOnly cookies set by the auth routes; no token is ever
returned in JSON. get_current_voter/get_current_admin resolve the caller from the
access cookie; admin endpoints declare the permission they need via require_permission.
"""

from fastapi import HTTPException, Request, Response

from lib.db import db
from lib.security import (ACCESS_COOKIE, REFRESH_COOKIE, create_access_token,
                          create_refresh_token, decode_access)

ACCESS_TTL_MINUTES = int(__import__("os").environ.get("JWT_ACCESS_TTL_MINUTES", "120"))

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "SUPER_ADMIN": {"*"},
    "ELECTION_ADMIN": {
        "election:view", "election:create", "election:update", "election:open", "election:close",
        "candidate:create", "candidate:update", "candidate:delete", "constituency:manage",
        "voter:view", "voter:moderate", "monitor:view", "result:view", "result:generate",
        "blockchain:view", "blockchain:verify", "settings:view", "report:view", "audit:view",
    },
    "AUDITOR": {
        "election:view", "voter:view", "monitor:view", "audit:view", "blockchain:view",
        "blockchain:verify", "result:view", "report:view", "security:view", "settings:view",
    },
    "RESULTS_OFFICER": {
        "election:view", "voter:view", "monitor:view", "result:view", "result:generate",
        "result:publish", "blockchain:view", "blockchain:verify", "report:view", "settings:view",
    },
    "SECURITY_OFFICER": {
        "election:view", "voter:view", "voter:moderate", "monitor:view", "security:view",
        "fraud:review", "audit:view", "blockchain:view", "blockchain:verify", "result:view",
        "settings:view",
    },
}


def has_permission(role: str, permission: str) -> bool:
    perms = ROLE_PERMISSIONS.get(role, set())
    return "*" in perms or permission in perms


def set_session_cookies(response: Response, subject: str, typ: str, role: str | None = None) -> None:
    response.set_cookie(
        ACCESS_COOKIE, create_access_token(subject, typ, role),
        httponly=True, samesite="lax", max_age=ACCESS_TTL_MINUTES * 60, path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE, create_refresh_token(subject, typ),
        httponly=True, samesite="lax", max_age=7 * 24 * 3600, path="/",
    )


def clear_session_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(name, path="/")


VOTER_PROJECTION = {"password_hash": 0, "mfa_code_hash": 0}
ADMIN_PROJECTION = {"password_hash": 0, "mfa_code_hash": 0}


async def get_current_voter(request: Request) -> dict | None:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    payload = decode_access(token)
    if not payload or payload.get("typ") != "voter":
        return None
    return await db.voters.find_one({"id": payload["sub"]}, VOTER_PROJECTION)


async def require_voter(request: Request) -> dict:
    voter = await get_current_voter(request)
    if not voter:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    if voter.get("status") == "SUSPENDED":
        raise HTTPException(status_code=403, detail="This voter account is suspended. Contact the election commission.")
    return voter


async def get_current_admin(request: Request) -> dict | None:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return None
    payload = decode_access(token)
    if not payload or payload.get("typ") != "admin":
        return None
    return await db.admins.find_one({"id": payload["sub"]}, ADMIN_PROJECTION)


async def require_admin(request: Request) -> dict:
    admin = await get_current_admin(request)
    if not admin:
        raise HTTPException(status_code=401, detail="Admin session required. Please sign in again.")
    return admin


def require_permission(permission: str):
    async def dependency(request: Request) -> dict:
        admin = await require_admin(request)
        if not has_permission(admin.get("role", ""), permission):
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({admin.get('role')}) does not hold the '{permission}' permission.",
            )
        return admin

    return dependency
