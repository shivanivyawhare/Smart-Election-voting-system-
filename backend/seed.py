"""Development seed data (spec §44) — synthetic identities only, DEVELOPMENT ONLY.

Run: cd /app/backend && python seed.py

Drops and rebuilds the app collections, re-applies indexes, then seeds admins,
constituencies, candidates, 100 synthetic voters and 2 elections. Seeded ballots
are cast through the SAME primitives the live API uses (AES-256-GCM encrypted
choices, unique vote marks, hash-chained ledger blocks) — never fake rows.
"""

import asyncio
import random
from datetime import timedelta

from lib.db import client, db, ensure_indexes
from lib.ledger import append_block, ensure_genesis
from lib.audit import record_audit
from lib.security import (canonical, decrypt_ballot, encrypt_ballot, hash_password,
                          mask_ref, new_id, now_utc, sha256_hex)

random.seed(42)
NOW = now_utc()

ADMINS = [
    ("admin@example.com", "Anita Desai", "SUPER_ADMIN", "Admin@123"),
    ("election.admin@example.com", "Rajesh Kumar", "ELECTION_ADMIN", "Election@123"),
    ("auditor@example.com", "Priya Nair", "AUDITOR", "Auditor@123"),
    ("results.officer@example.com", "Suresh Babu", "RESULTS_OFFICER", "Results@123"),
    ("security.officer@example.com", "Neha Kulkarni", "SECURITY_OFFICER", "Security@123"),
]
VOTER_PASSWORD = "Voter@123"

CONSTITUENCIES = [
    {"code": "NDL-01", "name": "New Delhi Central", "state": "Delhi", "district": "New Delhi"},
    {"code": "MUM-01", "name": "Mumbai South", "state": "Maharashtra", "district": "Mumbai"},
    {"code": "BLR-01", "name": "Bengaluru South", "state": "Karnataka", "district": "Bengaluru"},
]

# (election, constituency code, name, party, symbol, description)
CANDIDATES = [
    ("E1", "NDL-01", "Aarav Sharma", "Progressive Alliance", "SB",
     "Two-term councillor focused on transit expansion and school modernisation."),
    ("E1", "NDL-01", "Diya Patel", "National Unity Party", "LM",
     "Economist advocating for small-business tax relief and metro line 4."),
    ("E1", "NDL-01", "Kabir Singh", "Independent", "RS",
     "RTI activist campaigning on transparent procurement."),
    ("E1", "MUM-01", "Meera Iyer", "Progressive Alliance", "SB",
     "Coastal resilience and affordable housing are her core agenda."),
    ("E1", "MUM-01", "Rohan Deshmukh", "National Unity Party", "LM",
     "Port modernisation plan with a public-audit dashboard."),
    ("E1", "BLR-01", "Ananya Rao", "Green Future Movement", "TR",
     "Climate planner pushing lake restoration and bus rapid transit."),
    ("E1", "BLR-01", "Vikram Nair", "Independent", "GB",
     "Startup founder focused on digital civic services."),
    ("E2", "NDL-01", "Sanya Kapoor", "National Unity Party", "LM",
     "Ward-level sanitation reform and night shelters."),
    ("E2", "NDL-01", "Arjun Mehta", "Progressive Alliance", "SB",
     "Teacher-led curriculum reform and library networks."),
    ("E2", "MUM-01", "Ishita Verma", "Green Future Movement", "TR",
     "Waste-segregation mandate with citizen audits."),
]

FIRST = ["Aarav", "Vivaan", "Diya", "Aanya", "Advik", "Kabir", "Ishaan", "Meera",
         "Rohan", "Sara", "Nisha", "Farhan", "Rhea", "Aditya", "Tara", "Nikhil",
         "Zoya", "Arnav", "Kiara", "Dev"]
LAST = ["Sharma", "Patel", "Iyer", "Khan", "Reddy", "Nair", "Kulkarni", "Deshmukh",
        "Bose", "Ghosh", "Kapoor", "Menon", "Rao", "Joshi", "Verma"]

COLLECTIONS = ["voters", "admins", "elections", "constituencies", "candidates",
               "identity_verifications", "face_verifications", "liveness_sessions",
               "voting_sessions", "voting_marks", "ballot_records", "vote_receipts",
               "election_results", "audit_logs", "security_events", "fraud_flags",
               "blockchain_blocks", "notifications", "refresh_tokens",
               "system_settings", "counters", "status_checks"]


async def cast_seed_vote(voter: dict, election: dict, candidate: dict, voted_at) -> None:
    """Seed a ballot through the same primitives as the live voting endpoint."""
    encrypted = encrypt_ballot({
        "candidate_id": candidate["id"],
        "candidate_name": candidate["name"],
        "party": candidate["party"],
        "election_id": election["id"],
        "cast_at": voted_at.isoformat(),
        "nonce": new_id(),
        "seed": True,
    })
    token = new_id()
    receipt_id = f"RCPT-{new_id().replace('-', '').upper()[:12]}"
    commitment = sha256_hex(f"{token}:{encrypted}:{election['id']}")
    await db.voting_marks.insert_one({
        "id": new_id(), "election_id": election["id"], "voter_id": voter["id"],
        "constituency_id": voter["constituency_id"], "receipt_id": receipt_id,
        "ballot_token_hash": sha256_hex(token), "idempotency_key": new_id(),
        "status": "CAST", "voted_at": voted_at, "seed": True,
    })
    await db.ballot_records.insert_one({
        "id": new_id(), "receipt_id": receipt_id, "ballot_token": token,
        "election_id": election["id"], "constituency_id": voter["constituency_id"],
        "encrypted_choice": encrypted, "commitment": commitment, "status": "VALID",
        "created_at": voted_at, "seed": True,
    })
    receipt = {"id": receipt_id, "election_id": election["id"], "commitment": commitment,
               "block_index": None, "created_at": voted_at, "seed": True}
    await db.vote_receipts.insert_one(receipt)
    block = await append_block("VOTE_COMMITMENT", election_id=election["id"],
                               record_hash=commitment,
                               metadata={"seed": True, "receipt_id": receipt_id})
    await db.vote_receipts.update_one({"id": receipt_id},
                                      {"$set": {"block_index": block["index"]}})


async def main() -> None:
    print("Seeding Smart E-Election development data — DEVELOPMENT ONLY, synthetic identities.")
    for coll in COLLECTIONS:
        await db[coll].drop()
    await ensure_indexes()
    await ensure_genesis()

    # --- constituencies ---
    constis: dict[str, dict] = {}
    for c in CONSTITUENCIES:
        doc = {**c, "id": new_id(), "created_at": NOW}
        constis[c["code"]] = doc
        await db.constituencies.insert_one(doc)

    # --- admins ---
    super_admin_id = None
    for email, name, role, pwd in ADMINS:
        doc = {"id": new_id(), "email": email, "full_name": name, "role": role,
               "status": "ACTIVE", "password_hash": hash_password(pwd),
               "failed_attempts": 0, "created_at": NOW - timedelta(days=30),
               "last_login_at": None}
        await db.admins.insert_one(doc)
        if role == "SUPER_ADMIN":
            super_admin_id = doc["id"]

    # --- candidates per election ---
    e1_id, e2_id = new_id(), new_id()
    cand_docs: list[dict] = []
    for key, consti_code, name, party, symbol, desc in CANDIDATES:
        cand_docs.append({
            "id": new_id(), "election_id": e1_id if key == "E1" else e2_id,
            "constituency_id": constis[consti_code]["id"], "name": name, "party": party,
            "symbol": symbol, "description": desc, "photo_url": None,
            "status": "ACTIVE", "created_at": NOW - timedelta(days=5),
            "updated_at": NOW - timedelta(days=5),
        })
    for c in cand_docs:
        await db.candidates.insert_one(c)

    # --- elections ---
    all_consti_ids = [c["id"] for c in constis.values()]
    e1 = {
        "id": e1_id, "election_code": "GE-2026-001",
        "name": "General Election 2026 — Lok Sabha Simulation",
        "description": "Sandbox general election across three simulation constituencies. "
                       "DEVELOPMENT ONLY — synthetic data.",
        "election_type": "GENERAL", "status": "OPEN",
        "start_at": NOW - timedelta(days=1), "end_at": NOW + timedelta(days=6),
        "constituency_ids": all_consti_ids, "auto_closed": False,
        "results_published_at": None, "created_by": super_admin_id,
        "created_at": NOW - timedelta(days=7), "updated_at": NOW - timedelta(days=1),
    }
    await db.elections.insert_one(e1)
    await record_audit("ELECTION_CREATED", "election", e1_id, actor_id=super_admin_id,
                       actor_role="SUPER_ADMIN", metadata={"election_id": e1_id, "seed": True})
    await append_block("ELECTION_CREATED", election_id=e1_id,
                       record_hash=sha256_hex(canonical({"code": e1["election_code"]})),
                       metadata={"seed": True, "name": e1["name"]})

    e2 = {
        "id": e2_id, "election_code": "MUN-2025-BYE",
        "name": "Municipal By-Election 2025 — Sandbox",
        "description": "Completed sandbox by-election with published results. "
                       "DEVELOPMENT ONLY — synthetic data.",
        "election_type": "LOCAL", "status": "CLOSED",
        "start_at": NOW - timedelta(days=10), "end_at": NOW - timedelta(days=3),
        "constituency_ids": [constis["NDL-01"]["id"], constis["MUM-01"]["id"]],
        "auto_closed": False, "results_published_at": None, "created_by": super_admin_id,
        "created_at": NOW - timedelta(days=14), "updated_at": NOW - timedelta(days=3),
    }
    await db.elections.insert_one(e2)
    await record_audit("ELECTION_CREATED", "election", e2_id, actor_id=super_admin_id,
                       actor_role="SUPER_ADMIN", metadata={"election_id": e2_id, "seed": True})
    await append_block("ELECTION_CREATED", election_id=e2_id,
                       record_hash=sha256_hex(canonical({"code": e2["election_code"]})),
                       metadata={"seed": True, "name": e2["name"]})

    # --- 100 synthetic voters ---
    voters: list[dict] = []
    for i in range(1, 101):
        consti = CONSTITUENCIES[i % 3]
        status = "PENDING" if i > 90 else "APPROVED"
        verified = i <= 85  # last voters still need verification/approval
        doc = {
            "id": new_id(),
            "full_name": f"{FIRST[i % len(FIRST)]} {LAST[(i * 7) % len(LAST)]}",
            "email": f"voter{i:02d}@example.dev",
            "mobile": f"9{100000000 + i}",
            "date_of_birth": f"{1970 + (i % 30)}-0{(i % 9) + 1}-1{i % 9}",
            "state": consti["state"], "district": consti["district"],
            "constituency_id": constis[consti["code"]]["id"],
            "voter_ref": f"VR{100000 + i}",
            "voter_ref_masked": mask_ref(f"VR{100000 + i}"),
            "password_hash": hash_password(VOTER_PASSWORD),
            "status": status, "suspended": False,
            "identity_verified": verified,
            "identity_masked": f"XXXX-XXXX-{1000 + i}",
            "face_verified": verified,
            "liveness_verified": verified,
            "created_at": NOW - timedelta(days=i % 20, hours=i % 13),
            "updated_at": NOW - timedelta(days=i % 20, hours=i % 13),
        }
        voters.append(doc)
        await db.voters.insert_one(doc)

    # --- seeded votes (weighted, deterministic) ---
    e1_candidates = [c for c in cand_docs if c["election_id"] == e1_id]
    e2_candidates = [c for c in cand_docs if c["election_id"] == e2_id]
    weights = [5, 4, 3, 2]
    votes_cast = 0
    for i, voter in enumerate(voters[:60], start=1):  # E1: 60 votes over the last 24h
        options = [c for c in e1_candidates if c["constituency_id"] == voter["constituency_id"]]
        if not options:
            continue
        candidate = random.choices(options, weights=weights[:len(options)])[0]
        voted_at = NOW - timedelta(hours=random.uniform(0.2, 23.5))
        await cast_seed_vote(voter, e1, candidate, voted_at)
        votes_cast += 1
    for voter in voters[30:100]:  # E2: 70 votes among eligible constituencies
        options = [c for c in e2_candidates if c["constituency_id"] == voter["constituency_id"]]
        if not options or not voter["identity_verified"]:
            continue
        candidate = random.choices(options, weights=weights[:len(options)])[0]
        voted_at = NOW - timedelta(days=4, hours=random.uniform(0, 12))
        await cast_seed_vote(voter, e2, candidate, voted_at)
        votes_cast += 1

    # --- count + publish E2 through the same logic as the counting service ---
    e2_totals: dict[str, int] = {c["id"]: 0 for c in e2_candidates}
    e2_by_constituency: dict[str, dict[str, int]] = {}
    e2_valid = e2_invalid = 0
    async for ballot in db.ballot_records.find({"election_id": e2_id, "status": "VALID"}):
        try:
            choice = decrypt_ballot(ballot["encrypted_choice"])
            if choice["candidate_id"] not in e2_totals:
                raise KeyError("candidate not on ballot")
        except Exception:
            e2_invalid += 1
            continue
        e2_valid += 1
        e2_totals[choice["candidate_id"]] += 1
        bucket = e2_by_constituency.setdefault(ballot.get("constituency_id") or "unknown", {})
        bucket[choice["candidate_id"]] = bucket.get(choice["candidate_id"], 0) + 1
    turnout = []
    for const_id in e2["constituency_ids"]:
        eligible = sum(1 for v in voters if v["constituency_id"] == const_id
                       and v["status"] == "APPROVED")
        cast = sum(e2_by_constituency.get(const_id, {}).values())
        turnout.append({"constituency_id": const_id, "eligible_voters": eligible,
                        "votes_cast": cast,
                        "turnout_pct": round(cast / eligible * 100, 2) if eligible else 0.0})
    snapshot = {
        "id": new_id(), "election_id": e2_id, "generated_by": super_admin_id,
        "generated_at": (NOW - timedelta(days=2)).isoformat(),
        "totals": e2_totals, "valid_votes": e2_valid, "invalid_votes": e2_invalid,
        "votes_cast": e2_valid + e2_invalid,
        "by_constituency": e2_by_constituency, "turnout": turnout, "seed": True,
    }
    payload = {k: v for k, v in snapshot.items()
               if k not in ("_id", "snapshot_hash", "id", "generated_by")}
    snapshot["snapshot_hash"] = sha256_hex(canonical(payload))
    await db.election_results.insert_one(snapshot)
    await db.elections.update_one(
        {"id": e2_id},
        {"$set": {"status": "RESULTS_PUBLISHED", "results_published_at": NOW - timedelta(days=2),
                  "published_snapshot_id": snapshot["id"]}})
    await record_audit("RESULT_PUBLISHED", "election", e2_id, actor_id=super_admin_id,
                       actor_role="SUPER_ADMIN",
                       metadata={"election_id": e2_id, "snapshot_hash": snapshot["snapshot_hash"],
                                 "seed": True})
    await append_block("RESULT_GENERATED", election_id=e2_id,
                       record_hash=snapshot["snapshot_hash"],
                       metadata={"seed": True, "snapshot_id": snapshot["id"]})
    await append_block("RESULT_PUBLISHED", election_id=e2_id,
                       record_hash=snapshot["snapshot_hash"],
                       metadata={"seed": True, "snapshot_id": snapshot["id"]})

    # --- a couple of synthetic security events + one flag for the monitor (labelled) ---
    await db.security_events.insert_one({
        "id": new_id(), "event_type": "VOTER_LOGIN_FAILED", "severity": "LOW",
        "voter_id": voters[0]["id"], "ip_address": "203.0.113.7",
        "metadata": {"seed": True, "note": "synthetic demo event"},
        "created_at": NOW - timedelta(hours=5)})
    await db.security_events.insert_one({
        "id": new_id(), "event_type": "LIVENESS_FAILED", "severity": "HIGH",
        "voter_id": None, "ip_address": "203.0.113.99",
        "metadata": {"seed": True, "note": "synthetic demo event — possible spoofing"},
        "created_at": NOW - timedelta(hours=2)})
    await db.fraud_flags.insert_one({
        "id": new_id(), "subject_id": "203.0.113.99", "subject_type": "ip",
        "event_type": "LIVENESS_FAILED", "risk_level": "HIGH",
        "reason": "Multiple failed liveness attempts — possible spoofing",
        "occurrences": 3, "status": "FLAG_FOR_REVIEW", "reviewed_by": None,
        "review_note": None, "created_at": NOW - timedelta(hours=2),
        "updated_at": NOW - timedelta(hours=2), "seed": True})

    print(f"Seed complete (DEVELOPMENT ONLY):\n"
          f"  admins: {len(ADMINS)} (SUPER_ADMIN admin@example.com / Admin@123)\n"
          f"  voters: {len(voters)} (voter01@example.dev .. voter100@example.dev / {VOTER_PASSWORD})\n"
          f"  constituencies: {len(CONSTITUENCIES)}, candidates: {len(cand_docs)}\n"
          f"  elections: 2 (1 OPEN with {sum(1 for _ in [])}+ votes live, 1 RESULTS_PUBLISHED)\n"
          f"  seeded ballots: {votes_cast}")

asyncio.run(main())
