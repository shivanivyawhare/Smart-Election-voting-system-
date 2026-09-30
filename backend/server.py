"""Smart E-Election System — FastAPI bootstrap.

Route registration contract (README.md): every feature router mounts on
`api_router` (prefix /api); `app.include_router(api_router)` stays the last
router statement. Middleware below applies to the whole app.
"""

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from lib import ratelimit as rl
from lib.audit import record_security_event
from lib.db import client, db, ensure_indexes
from lib.ledger import ensure_genesis
from lib.security import new_id
from routers import audit as audit_routes
from routers import (auth, blockchain, candidates, elections, face, identity,
                     liveness, monitoring, results, system, voters, voting)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def startup() -> None:
        await ensure_indexes()
        await ensure_genesis()

    app.state.startup_task = asyncio.create_task(startup())  # never block boot on index builds
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="Smart E-Election System API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# --- Template connectivity routes (kept from the starter pattern) ---
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "Smart E-Election System API", "docs": "/docs"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj


@api_router.get("/status", response_model=list[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# --- Feature routers ---
api_router.include_router(auth.router)
api_router.include_router(identity.router)
api_router.include_router(face.router)
api_router.include_router(liveness.router)
api_router.include_router(elections.router)
api_router.include_router(candidates.router)
api_router.include_router(voters.router)
api_router.include_router(voting.router)
api_router.include_router(results.router)
api_router.include_router(blockchain.router)
api_router.include_router(audit_routes.router)
api_router.include_router(system.router)
api_router.include_router(monitoring.router)

# Include the router in the main app — stays the last router statement
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ middleware
# Sliding-window rate limiting (in-process substitute for Redis; docs/security.md)
# + request-id propagation. Sensitive routes get their own strict buckets.
SENSITIVE_LIMITS: list[tuple[str, int, int]] = [
    ("/api/auth/admin/login", 8, 300),
    ("/api/auth/admin/mfa", 8, 300),
    ("/api/auth/login", 10, 300),
    ("/api/auth/register", 10, 3600),
    ("/api/voting/cast", 20, 60),
    ("/api/face/", 30, 60),
    ("/api/liveness/", 30, 60),
    ("/api/identity/", 20, 60),
]


@app.middleware("http")
async def rate_limit_and_request_id(request: Request, call_next):
    if request.url.path.startswith("/api"):
        ip = request.client.host if request.client else "unknown"
        matched = next((entry for entry in SENSITIVE_LIMITS
                        if request.url.path.startswith(entry[0])), None)
        if matched:
            prefix, limit, window = matched
            allowed = rl.hit(f"{prefix}:{ip}", limit, window)
        else:
            allowed = rl.hit(f"global:{ip}", 300, 60)
        if not allowed:
            try:
                await record_security_event("RATE_LIMITED", "MEDIUM", ip=ip,
                                            metadata={"path": request.url.path})
            except Exception:
                pass
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again shortly."},
            )
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.headers.get("x-request-id") or new_id()
    return response
