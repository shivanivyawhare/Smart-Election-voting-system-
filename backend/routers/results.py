"""Counting + results (spec §23-25).

Counts derive exclusively from encrypted ballot records — there is no endpoint that
writes a vote count, so manual modification of totals is impossible. The result
snapshot is hashed and anchored into the ledger; publishing is a guarded transition.
"""

import io
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response as FastResponse

from lib.audit import record_audit
from lib.db import db
from lib.domain import get_election
from lib.ledger import append_block
from lib.providers import notify_email
from lib.security import canonical, decrypt_ballot, new_id, now_utc, sha256_hex
from lib.session import require_admin, require_permission
from models.elections import Candidate

router = APIRouter()


def _snapshot_payload(snapshot: dict) -> dict:
    return {k: v for k, v in snapshot.items() if k not in ("_id", "snapshot_hash", "id", "generated_by")}


@router.post("/results/{election_id}/generate")
async def generate_results(election_id: str, request: Request):
    admin = await require_permission("result:generate")(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    if e["status"] not in ("CLOSED", "COUNTING", "RESULTS_PUBLISHED"):
        raise HTTPException(status_code=409,
                            detail="Counting can start only after the election is CLOSED.")

    if e["status"] == "CLOSED":
        await db.elections.update_one(
            {"id": e["id"]},
            {"$set": {"status": "COUNTING", "counting_started_at": now_utc(),
                      "updated_at": now_utc()}})
        await record_audit("ELECTION_COUNTING", "election", e["id"], actor_id=admin["id"],
                           actor_role=admin["role"], request=request,
                           metadata={"election_id": e["id"]})

    candidates = await db.candidates.find({"election_id": e["id"]}).to_list(1000)
    candidate_by_id = {c["id"]: c for c in candidates}
    totals: dict[str, int] = {c["id"]: 0 for c in candidates}
    by_constituency: dict[str, dict[str, int]] = {}
    valid_votes = invalid_votes = 0

    async for ballot in db.ballot_records.find({"election_id": e["id"], "status": "VALID"}):
        try:
            choice = decrypt_ballot(ballot["encrypted_choice"])
            cand = candidate_by_id.get(choice.get("candidate_id"))
            if not cand or cand.get("status") != "ACTIVE":
                raise KeyError("candidate not on ballot")
        except Exception:
            invalid_votes += 1
            await db.ballot_records.update_one({"id": ballot["id"]},
                                               {"$set": {"status": "INVALID"}})
            continue
        valid_votes += 1
        totals[cand["id"]] = totals.get(cand["id"], 0) + 1
        cid = ballot.get("constituency_id") or "unknown"
        bucket = by_constituency.setdefault(cid, {})
        bucket[cand["id"]] = bucket.get(cand["id"], 0) + 1

    turnout = []
    for const_id in e.get("constituency_ids", []):
        eligible = await db.voters.count_documents(
            {"constituency_id": const_id, "status": "APPROVED", "suspended": False})
        cast = sum(by_constituency.get(const_id, {}).values())
        turnout.append({
            "constituency_id": const_id,
            "eligible_voters": eligible,
            "votes_cast": cast,
            "turnout_pct": round(cast / eligible * 100, 2) if eligible else 0.0,
        })

    snapshot = {
        "id": new_id(),
        "election_id": e["id"],
        "generated_by": admin["id"],
        "generated_at": now_utc().isoformat(),
        "totals": totals,
        "valid_votes": valid_votes,
        "invalid_votes": invalid_votes,
        "votes_cast": valid_votes + invalid_votes,
        "by_constituency": by_constituency,
        "turnout": turnout,
    }
    snapshot["snapshot_hash"] = sha256_hex(canonical(_snapshot_payload(snapshot)))
    await db.election_results.insert_one(snapshot)
    await record_audit("RESULT_GENERATED", "election_result", snapshot["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": e["id"],
                                 "snapshot_hash": snapshot["snapshot_hash"]})
    await append_block("RESULT_GENERATED", election_id=e["id"],
                       record_hash=snapshot["snapshot_hash"],
                       metadata={"snapshot_id": snapshot["id"]})
    return {"snapshot_id": snapshot["id"], "snapshot_hash": snapshot["snapshot_hash"],
            "valid_votes": valid_votes, "invalid_votes": invalid_votes,
            "election_status": "COUNTING" if e["status"] == "CLOSED" else e["status"]}


@router.post("/results/{election_id}/publish")
async def publish_results(election_id: str, request: Request):
    admin = await require_permission("result:publish")(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    if e["status"] != "COUNTING":
        raise HTTPException(status_code=409,
                            detail="Results can be published from COUNTING state only. Generate the count first.")
    snapshot = await db.election_results.find_one({"election_id": e["id"]},
                                                  sort=[("created_at", -1)])
    if not snapshot:
        raise HTTPException(status_code=409, detail="No result snapshot exists for this election.")
    published_at = now_utc()
    await db.elections.update_one(
        {"id": e["id"]},
        {"$set": {"status": "RESULTS_PUBLISHED", "results_published_at": published_at,
                  "published_snapshot_id": snapshot["id"], "updated_at": now_utc()}})
    await record_audit("RESULT_PUBLISHED", "election", e["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": e["id"],
                                 "snapshot_hash": snapshot["snapshot_hash"]})
    await append_block("RESULT_PUBLISHED", election_id=e["id"],
                       record_hash=snapshot["snapshot_hash"],
                       metadata={"snapshot_id": snapshot["id"]})
    await notify_email("electorate@sandbox.local", "Results published",
                       f"Results for election '{e['name']}' have been published. (Sandbox notification)")
    return {"published": True, "published_at": published_at,
            "snapshot_hash": snapshot["snapshot_hash"]}


async def _build_result(e: dict, snapshot: dict) -> dict:
    candidates = await db.candidates.find({"election_id": e["id"]}).to_list(1000)
    total_valid = snapshot["valid_votes"] or 1
    rows = []
    for c in candidates:
        votes = snapshot["totals"].get(c["id"], 0)
        rows.append({
            "candidate_id": c["id"], "name": c["name"], "party": c["party"],
            "symbol": c["symbol"], "votes": votes,
            "percentage": round(votes / total_valid * 100, 2),
        })
    rows.sort(key=lambda r: r["votes"], reverse=True)
    block = await db.blockchain_blocks.find_one(
        {"event_type": "RESULT_PUBLISHED", "election_id": e["id"], "record_hash": snapshot["snapshot_hash"]})
    block_gen = await db.blockchain_blocks.find_one(
        {"event_type": "RESULT_GENERATED", "election_id": e["id"], "record_hash": snapshot["snapshot_hash"]})
    recompute = sha256_hex(canonical(_snapshot_payload(snapshot)))
    return {
        "election": {"id": e["id"], "election_code": e["election_code"], "name": e["name"],
                     "status": e["status"], "start_at": e["start_at"], "end_at": e["end_at"],
                     "results_published_at": e.get("results_published_at")},
        "snapshot_hash": snapshot["snapshot_hash"],
        "snapshot_hash_intact": recompute == snapshot["snapshot_hash"],
        "valid_votes": snapshot["valid_votes"],
        "invalid_votes": snapshot["invalid_votes"],
        "votes_cast": snapshot["votes_cast"],
        "turnout": snapshot["turnout"],
        "by_constituency": snapshot.get("by_constituency", {}),
        "results": rows,
        "ledger_block_index": (block or block_gen or {}).get("index"),
        "ledger_block_hash": (block or block_gen or {}).get("current_hash"),
    }


@router.get("/results/{election_id}")
async def public_result(election_id: str, request: Request):
    """Published results (public). Admins with result:view may preview a generated count."""
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    snapshot = await db.election_results.find_one({"election_id": e["id"]},
                                                  sort=[("created_at", -1)])
    if e["status"] != "RESULTS_PUBLISHED":
        admin = await require_admin_or_none(request)
        if not (admin and snapshot):
            raise HTTPException(status_code=403,
                                detail="Results have not been published for this election yet.")
    if not snapshot:
        raise HTTPException(status_code=404, detail="No result snapshot exists for this election.")
    return await _build_result(e, snapshot)


async def require_admin_or_none(request: Request):
    from lib.session import get_current_admin
    admin = await get_current_admin(request)
    if admin:
        from lib.session import has_permission
        if not has_permission(admin.get("role", ""), "result:view"):
            return None
    return admin


@router.get("/results/{election_id}/integrity")
async def result_integrity(election_id: str, request: Request):
    """'Verify Result Integrity' — recompute the snapshot hash and check its ledger anchor."""
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    snapshot = await db.election_results.find_one({"election_id": e["id"]},
                                                  sort=[("created_at", -1)])
    if not snapshot:
        raise HTTPException(status_code=404, detail="No result snapshot exists for this election.")
    recompute = sha256_hex(canonical(_snapshot_payload(snapshot)))
    block = await db.blockchain_blocks.find_one(
        {"election_id": e["id"], "record_hash": snapshot["snapshot_hash"],
         "event_type": {"$in": ["RESULT_GENERATED", "RESULT_PUBLISHED"]}})
    intact = recompute == snapshot["snapshot_hash"] and block is not None
    admin = await get_current_admin_public(request)
    await record_audit("RESULT_INTEGRITY_CHECKED", "election_result", snapshot["id"],
                       actor_id=admin["id"] if admin else "public",
                       actor_role=admin["role"] if admin else "PUBLIC", request=request,
                       metadata={"election_id": e["id"], "intact": intact})
    return {
        "valid": intact,
        "status": "RESULT INTEGRITY VERIFIED" if intact else "INTEGRITY VIOLATION DETECTED",
        "snapshot_hash": snapshot["snapshot_hash"],
        "recomputed_hash": recompute,
        "ledger_block_index": (block or {}).get("index"),
        "checked_at": now_utc(),
    }


@router.get("/results/{election_id}/{constituency_id}")
async def public_result_constituency(election_id: str, constituency_id: str, request: Request):
    full = await public_result(election_id, request)
    consti = await db.constituencies.find_one({"id": constituency_id})
    if not consti:
        raise HTTPException(status_code=404, detail="Constituency not found.")
    candidates = {c["id"]: c for c in await db.candidates.find(
        {"election_id": election_id}).to_list(1000)}
    counts = full.get("by_constituency", {}).get(constituency_id, {}) if isinstance(full, dict) else {}
    rows = []
    total = sum(counts.values()) or 1
    for cid, cand in candidates.items():
        votes = counts.get(cid, 0)
        rows.append({"candidate_id": cid, "name": cand["name"], "party": cand["party"],
                     "symbol": cand["symbol"], "votes": votes,
                     "percentage": round(votes / total * 100, 2)})
    rows.sort(key=lambda r: r["votes"], reverse=True)
    turnout_row = next((t for t in full["turnout"] if t["constituency_id"] == constituency_id), None)
    return {"election": full["election"], "constituency": {"id": consti["id"], "code": consti["code"],
                                                          "name": consti["name"]},
            "results": rows, "turnout": turnout_row, "snapshot_hash": full["snapshot_hash"],
            "ledger_block_index": full["ledger_block_index"]}


async def get_current_admin_public(request: Request):
    from lib.session import get_current_admin
    return await get_current_admin(request)


# ------------------------------------------------------------------ certificate (PDF)


@router.get("/admin/results/{election_id}/certificate")
async def result_certificate(election_id: str, request: Request):
    admin = await require_permission("report:view")(request)
    e = await get_election(election_id)
    if not e:
        raise HTTPException(status_code=404, detail="Election not found.")
    if e["status"] != "RESULTS_PUBLISHED":
        raise HTTPException(status_code=409,
                            detail="A result certificate can be generated after results are published.")
    snapshot = await db.election_results.find_one({"election_id": e["id"]},
                                                  sort=[("created_at", -1)])
    if not snapshot:
        raise HTTPException(status_code=404, detail="No result snapshot exists for this election.")
    result = await _build_result(e, snapshot)
    pdf = _certificate_pdf(e, result)
    await record_audit("RESULT_CERTIFICATE_GENERATED", "election", e["id"], actor_id=admin["id"],
                       actor_role=admin["role"], request=request,
                       metadata={"election_id": e["id"], "snapshot_hash": snapshot["snapshot_hash"]})
    return FastResponse(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=result-certificate-{e['election_code']}.pdf"},
    )


def _certificate_pdf(e: dict, result: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                    TableStyle)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=f"Result Certificate — {e['name']}")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("SMART E-ELECTION SYSTEM (SANDBOX)", styles["Heading2"]),
        Paragraph("OFFICIAL ELECTION RESULT CERTIFICATE", styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Election: <b>{e['name']}</b>", styles["Normal"]),
        Paragraph(f"Election ID: {e['id']} &nbsp;&nbsp; Code: {e['election_code']}", styles["Normal"]),
        Paragraph(f"Publication timestamp: {e.get('results_published_at')}", styles["Normal"]),
        Spacer(1, 10),
        Paragraph("Candidate totals", styles["Heading3"]),
    ]
    table_data = [["Candidate", "Party", "Votes", "Percentage"]]
    for row in result["results"]:
        table_data.append([row["name"], row["party"], str(row["votes"]), f"{row['percentage']}%"])
    table = Table(table_data, colWidths=[200, 140, 60, 80])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B192C")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
    ]))
    story += [table, Spacer(1, 10),
              Paragraph(f"Total votes cast: {result['votes_cast']} &nbsp;&nbsp; "
                        f"Valid: {result['valid_votes']} &nbsp;&nbsp; "
                        f"Invalid: {result['invalid_votes']}", styles["Normal"]),
              Paragraph(f"Turnout: {', '.join(t['turnout_pct'] + '%' for t in result['turnout'])}",
                        styles["Normal"]),
              Spacer(1, 12),
              Paragraph("Integrity record", styles["Heading3"]),
              Paragraph(f"Result hash: {result['snapshot_hash']}", styles["Normal"]),
              Paragraph(f"Ledger block: #{result['ledger_block_index']} "
                        f"({result['ledger_block_hash']})", styles["Normal"]),
              Paragraph(f"Verification: {'INTACT' if result['snapshot_hash_intact'] else 'VIOLATION'}",
                        styles["Normal"]),
              Spacer(1, 12),
              Paragraph("DEVELOPMENT / SANDBOX ENVIRONMENT — synthetic data only.", styles["Italic"]),
            ]
    doc.build(story)
    return buf.getvalue()
