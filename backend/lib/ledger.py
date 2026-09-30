"""Local permissioned blockchain — an append-only, hash-chained ledger of election
integrity events stored in its own collection.

Only non-sensitive integrity metadata is ever anchored: event type, election id and
a record hash. No personal data, vote choices or credentials enter the ledger
(spec §22). The block/hash interface is deliberately narrow so a Hyperledger
Fabric adapter can replace `append_block`/`verify_chain` in production
(BLOCKCHAIN_NETWORK env, docs/blockchain.md).
"""

import logging
from datetime import datetime, timezone

from pymongo import ASCENDING, DESCENDING, IndexModel

from lib.db import db
from lib.security import canonical, new_id, now_utc, sha256_hex

logger = logging.getLogger(__name__)

COLL = "blockchain_blocks"
GENESIS_PREV = "0" * 64


def _block_hash(block: dict) -> str:
    return sha256_hex(canonical({k: v for k, v in block.items() if k != "current_hash"}))


def _stamp() -> str:
    """Ledger timestamps are ISO strings, not BSON datetimes: BSON truncates datetime
    precision on read, which would change the recomputed hash and false-alarm the
    chain verification."""
    return now_utc().isoformat()


async def ensure_genesis() -> None:
    if await db[COLL].find_one({"index": 0}) is None:
        block = {
            "id": new_id(),
            "index": 0,
            "timestamp": _stamp(),
            "event_type": "GENESIS",
            "election_id": None,
            "record_hash": GENESIS_PREV,
            "previous_hash": GENESIS_PREV,
            "metadata": {"note": "local permissioned ledger genesis block"},
        }
        block["current_hash"] = _block_hash(block)
        await db[COLL].insert_one(block)
        logger.info("ledger: genesis block created")


async def append_block(event_type: str, election_id: str | None = None,
                       record_hash: str | None = None, metadata: dict | None = None) -> dict:
    """Append one integrity event. Hash covers everything except current_hash itself."""
    last = await db[COLL].find_one({}, sort=[("index", DESCENDING)])
    block = {
        "id": new_id(),
        "index": 0 if last is None else last["index"] + 1,
        "timestamp": _stamp(),
        "event_type": event_type,
        "election_id": election_id,
        "record_hash": record_hash,
        "previous_hash": last["current_hash"] if last else GENESIS_PREV,
        "metadata": metadata or {},
    }
    block["current_hash"] = _block_hash(block)
    await db[COLL].insert_one(block)
    return block


async def verify_chain() -> dict:
    """Recompute every hash and the prev-linkage. Returns CHAIN VALID / violation info."""
    blocks = await db[COLL].find({}, sort=[("index", ASCENDING)]).to_list(20000)
    prev = GENESIS_PREV
    checked_at = now_utc()
    for block in blocks:
        expected_prev = GENESIS_PREV if block["index"] == 0 else prev
        if block["previous_hash"] != expected_prev or block["current_hash"] != _block_hash(block):
            return {
                "valid": False,
                "blocks_checked": len(blocks),
                "first_invalid_index": block["index"],
                "checked_at": checked_at,
                "status": "INTEGRITY VIOLATION DETECTED",
            }
        prev = block["current_hash"]
    return {
        "valid": True,
        "blocks_checked": len(blocks),
        "first_invalid_index": None,
        "checked_at": checked_at,
        "status": "CHAIN VALID",
    }


def ledger_indexes() -> list[IndexModel]:
    return [
        IndexModel([("index", ASCENDING)], name="index", unique=True),
        IndexModel([("current_hash", ASCENDING)], name="current_hash", unique=True),
        IndexModel([("election_id", ASCENDING), ("index", DESCENDING)], name="election_index"),
    ]


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()
