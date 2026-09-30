"""Blockchain explorer routes (spec §22). The ledger stores only integrity metadata:
event type, election id, record hashes. Personal data never enters the chain."""

from fastapi import APIRouter, Request

from lib.audit import record_audit
from lib.db import db
from lib.ledger import verify_chain
from lib.session import require_permission
from lib.security import normalize_dt, now_utc

router = APIRouter()


def block_out(b: dict) -> dict:
    return {
        "index": b["index"],
        "timestamp": b["timestamp"],
        "event_type": b["event_type"],
        "election_id": b.get("election_id"),
        "record_hash": b.get("record_hash"),
        "previous_hash": b["previous_hash"],
        "current_hash": b["current_hash"],
        "metadata": b.get("metadata", {}),
    }


@router.get("/blockchain/blocks")
async def list_blocks(request: Request, limit: int = 100):
    await require_permission("blockchain:view")(request)
    limit = max(1, min(500, limit))
    total = await db.blockchain_blocks.count_documents({})
    blocks = await db.blockchain_blocks.find({}).sort([("index", -1)]).limit(limit).to_list(limit)
    latest = blocks[0] if blocks else None
    return {"total": total, "blocks": [block_out(b) for b in blocks],
            "latest": block_out(latest) if latest else None}


@router.get("/blockchain/verify")
async def verify_blockchain(request: Request):
    admin = await require_permission("blockchain:verify")(request)
    result = await verify_chain()
    await record_audit("BLOCKCHAIN_VERIFIED", "blockchain", None,
                       actor_id=admin["id"], actor_role=admin["role"],
                       request=request, metadata={"valid": result["valid"]})
    return result


@router.get("/blockchain/election/{election_id}")
async def election_blocks(election_id: str, request: Request):
    await require_permission("blockchain:view")(request)
    blocks = await db.blockchain_blocks.find({"election_id": election_id}) \
        .sort([("index", -1)]).limit(200).to_list(200)
    return {"election_id": election_id, "total": len(blocks),
            "blocks": [block_out(b) for b in blocks]}
