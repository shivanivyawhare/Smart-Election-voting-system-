"""Live turnout alerting (admin) and a voter's own activity trail.

Turnout alerts compare each constituency of an OPEN election against the election's
mean turnout — a constituency lagging far behind is surfaced for review. Nothing here
exposes a vote choice: only counts of recorded ballots.

The voter activity trail reads the voter's own append-only audit entries and security
events. A voter can only ever read their own rows (scoped by the session subject).
"""

from fastapi import APIRouter, Request

from lib.db import db
from lib.session import require_permission, require_voter

router = APIRouter()

ALERT_LEVELS = ((0.40, "CRITICAL"), (0.60, "HIGH"), (0.80, "MEDIUM"))


def _level(ratio: float) -> str | None:
    for threshold, level in ALERT_LEVELS:
        if ratio < threshold:
            return level
    return None


@router.get("/admin/turnout/alerts")
async def turnout_alerts(request: Request):
    """Constituencies of OPEN elections whose turnout lags the election mean."""
    await require_permission("monitor:view")(request)
    consti_names = {c["id"]: c["name"] for c in await db.constituencies.find({}).to_list(500)}
    elections = await db.elections.find({"status": "OPEN"}).sort([("start_at", -1)]).to_list(50)

    out_elections = []
    alerts = []
    for e in elections:
        rows = []
        for cid in e.get("constituency_ids", []):
            eligible = await db.voters.count_documents(
                {"constituency_id": cid, "status": "APPROVED", "suspended": False})
            cast = await db.ballot_records.count_documents(
                {"election_id": e["id"], "constituency_id": cid, "status": "VALID"})
            rows.append({
                "constituency_id": cid,
                "constituency_name": consti_names.get(cid, cid),
                "eligible_voters": eligible,
                "votes_cast": cast,
                "turnout_pct": round(cast / eligible * 100, 2) if eligible else 0.0,
            })
        mean = round(sum(r["turnout_pct"] for r in rows) / len(rows), 2) if rows else 0.0
        for r in rows:
            r["mean_turnout_pct"] = mean
            r["gap_pct"] = round(r["turnout_pct"] - mean, 2)
            level = _level(r["turnout_pct"] / mean) if mean > 0 else None
            r["alert_level"] = level
            if level:
                alerts.append({
                    "election_id": e["id"],
                    "election_name": e["name"],
                    "election_code": e["election_code"],
                    **r,
                })
        out_elections.append({
            "election_id": e["id"],
            "election_name": e["name"],
            "election_code": e["election_code"],
            "mean_turnout_pct": mean,
            "constituencies": rows,
        })

    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
    alerts.sort(key=lambda a: (order.get(a["alert_level"], 9), a["turnout_pct"]))
    return {"open_elections": out_elections, "alerts": alerts, "alert_count": len(alerts)}


ACTIVITY_ACTIONS = [
    "VOTER_REGISTERED", "VOTER_LOGIN", "LOGOUT",
    "IDENTITY_CONSENT", "IDENTITY_INITIATED", "IDENTITY_VERIFIED",
    "IDENTITY_VERIFICATION_FAILED",
    "FACE_VERIFIED", "FACE_VERIFICATION_FAILED", "FACE_VERIFICATION_LOCKED",
    "LIVENESS_STARTED", "LIVENESS_VERIFIED", "LIVENESS_FAILED", "LIVENESS_LOCKED",
    "VOTING_SESSION_OPENED", "VOTE_CAST", "DUPLICATE_VOTE_ATTEMPT",
]

CATEGORY = {
    "VOTER_REGISTERED": "account", "VOTER_LOGIN": "sign-in", "LOGOUT": "sign-in",
    "IDENTITY_CONSENT": "identity", "IDENTITY_INITIATED": "identity",
    "IDENTITY_VERIFIED": "identity", "IDENTITY_VERIFICATION_FAILED": "identity",
    "FACE_VERIFIED": "face", "FACE_VERIFICATION_FAILED": "face",
    "FACE_VERIFICATION_LOCKED": "face",
    "LIVENESS_STARTED": "liveness", "LIVENESS_VERIFIED": "liveness",
    "LIVENESS_FAILED": "liveness", "LIVENESS_LOCKED": "liveness",
    "VOTING_SESSION_OPENED": "voting", "VOTE_CAST": "voting",
    "DUPLICATE_VOTE_ATTEMPT": "voting",
}


def _mask_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    parts = ip.split(".")
    return ".".join(parts[:3] + ["xxx"]) if len(parts) == 4 else "masked"


@router.get("/voter/activity")
async def voter_activity(request: Request, limit: int = 50):
    """The voter's own verification and sign-in history (append-only audit rows)."""
    voter = await require_voter(request)
    limit = max(5, min(200, limit))
    entries = await db.audit_logs.find(
        {"actor_id": {"$in": [voter["id"], voter["email"]]},
         "action": {"$in": ACTIVITY_ACTIONS}},
    ).sort([("seq", -1)]).limit(limit).to_list(limit)
    events = await db.security_events.find({"voter_id": voter["id"]}) \
        .sort([("created_at", -1)]).limit(limit).to_list(limit)

    return {
        "activity": [{
            "id": a["id"],
            "action": a["action"],
            "category": CATEGORY.get(a["action"], "other"),
            "result": a.get("result", "success"),
            "timestamp": a["timestamp"],
            "ip_masked": _mask_ip(a.get("ip_address")),
            "user_agent": (a.get("user_agent") or "")[:120] or None,
            "current_hash": a["current_hash"],
        } for a in entries],
        "security_events": [{
            "id": ev["id"], "event_type": ev["event_type"], "severity": ev["severity"],
            "created_at": ev["created_at"], "ip_masked": _mask_ip(ev.get("ip_address")),
        } for ev in events],
        "sign_in_count": sum(1 for a in entries if a["action"] == "VOTER_LOGIN"),
        "last_sign_in_at": next((a["timestamp"] for a in entries
                                 if a["action"] == "VOTER_LOGIN"), None),
    }
