"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    # --- identity ---
    "voters": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("voter_ref", ASCENDING)], name="voter_ref", unique=True),
        IndexModel([("constituency_id", ASCENDING), ("status", ASCENDING)], name="const_status"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "admins": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
    ],
    "refresh_tokens": [
        IndexModel([("jti", ASCENDING)], name="jti", unique=True),
        IndexModel([("subject", ASCENDING)], name="subject"),
    ],
    "constituencies": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code", unique=True),
    ],
    "elections": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("election_code", ASCENDING)], name="election_code", unique=True),
        IndexModel([("status", ASCENDING), ("start_at", ASCENDING)], name="status_start"),
    ],
    "candidates": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("election_id", ASCENDING), ("constituency_id", ASCENDING)], name="election_constituency"),
        IndexModel([("election_id", ASCENDING), ("status", ASCENDING)], name="election_status"),
        IndexModel([("election_id", ASCENDING), ("constituency_id", ASCENDING), ("name", ASCENDING)], name="dup_check"),
    ],
    "identity_verifications": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("voter_id", ASCENDING), ("created_at", DESCENDING)], name="voter_time"),
    ],
    "face_verifications": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("voter_id", ASCENDING), ("created_at", DESCENDING)], name="voter_time"),
    ],
    "liveness_sessions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("voter_id", ASCENDING), ("created_at", DESCENDING)], name="voter_time"),
    ],
    # --- voting ---
    "voting_sessions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("voter_id", ASCENDING), ("election_id", ASCENDING)], name="voter_election"),
    ],
    # THE double-voting constraint: one vote mark per voter per election, DB-enforced.
    "voting_marks": [
        IndexModel([("election_id", ASCENDING), ("voter_id", ASCENDING)], name="election_voter_unique", unique=True),
        IndexModel([("idempotency_key", ASCENDING)], name="idempotency_key"),
        IndexModel([("voted_at", DESCENDING)], name="voted_at_desc"),
    ],
    # Ballot records never carry voter_id — cryptographic separation from identity.
    "ballot_records": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("receipt_id", ASCENDING)], name="receipt_id", unique=True),
        IndexModel([("ballot_token", ASCENDING)], name="ballot_token", unique=True),
        IndexModel([("election_id", ASCENDING), ("status", ASCENDING)], name="election_status"),
    ],
    "vote_receipts": [
        IndexModel([("id", ASCENDING)], name="receipt_id", unique=True),
        IndexModel([("election_id", ASCENDING)], name="election"),
    ],
    "election_results": [
        IndexModel([("election_id", ASCENDING), ("created_at", DESCENDING)], name="election_time"),
    ],
    # --- integrity / operations ---
    "audit_logs": [
        IndexModel([("seq", DESCENDING)], name="seq_desc"),
        IndexModel([("current_hash", ASCENDING)], name="current_hash"),
        IndexModel([("action", ASCENDING), ("timestamp", DESCENDING)], name="action_time"),
        IndexModel([("actor_id", ASCENDING), ("timestamp", DESCENDING)], name="actor_time"),
    ],
    "security_events": [
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("event_type", ASCENDING), ("created_at", DESCENDING)], name="type_time"),
        IndexModel([("voter_id", ASCENDING), ("created_at", DESCENDING)], name="voter_time"),
    ],
    "fraud_flags": [
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_time"),
        IndexModel([("subject_id", ASCENDING), ("event_type", ASCENDING)], name="subject_type"),
    ],
    "blockchain_blocks": [
        IndexModel([("index", ASCENDING)], name="index", unique=True),
        IndexModel([("current_hash", ASCENDING)], name="current_hash", unique=True),
        IndexModel([("election_id", ASCENDING), ("index", DESCENDING)], name="election_index"),
    ],
    "notifications": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "system_settings": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "counters": [],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
