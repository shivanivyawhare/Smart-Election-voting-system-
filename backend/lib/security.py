"""Crypto & auth primitives: password hashing, JWT access/refresh tokens,
AES-256-GCM ballot encryption, canonical hashing helpers.

No secret ever lives in source: JWT keys and the ballot encryption key come from
backend/.env via os.environ (see .env.example). Outside DEVELOPMENT_MODE a missing
secret is a hard startup error rather than a silent fallback.
"""

import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

ACCESS_COOKIE = "ev_access"
REFRESH_COOKIE = "ev_refresh"


def is_dev_mode() -> bool:
    return os.environ.get("DEVELOPMENT_MODE", "false").lower() == "true"


def _secret(name: str) -> str:
    value = os.environ.get(name, "")
    if value:
        return value
    if is_dev_mode():
        # Deterministic dev-only fallback so the sandbox boots without hand-editing .env.
        return hashlib.sha256(f"dev-fallback::{name}".encode()).hexdigest()
    raise RuntimeError(f"{name} must be configured outside development mode")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def now_utc() -> datetime:
    """Aware UTC now — BSON datetimes are read back naive, so normalise on read too."""
    return datetime.now(timezone.utc)


def normalize_dt(dt: datetime) -> datetime:
    """Motor returns naive datetimes; treat them as UTC (TEMPLATE.md §4)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def expired(dt: datetime | None) -> bool:
    """True when a stored expiry is in the past. Normalises naive BSON datetimes first —
    comparing one against an aware now() raises TypeError and surfaces as a 500."""
    if dt is None:
        return True
    return normalize_dt(dt) < now_utc()


def in_future(dt: datetime | None) -> bool:
    return dt is not None and normalize_dt(dt) > now_utc()


def new_id() -> str:
    return str(uuid.uuid4())


def sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def canonical(obj) -> str:
    """Stable JSON encoding for hashing — never include Mongo _id."""
    if isinstance(obj, dict):
        obj = {k: v for k, v in obj.items() if k != "_id"}
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def create_access_token(subject: str, typ: str, role: str | None = None) -> str:
    now = now_utc()
    ttl = int(os.environ.get("JWT_ACCESS_TTL_MINUTES", "120"))
    payload = {
        "sub": subject,
        "typ": typ,  # "voter" | "admin"
        "role": role,
        "jti": new_id(),
        "iat": now,
        "exp": now + timedelta(minutes=ttl),
        "iss": "smart-eelection",
    }
    return jwt.encode(payload, _secret("JWT_SECRET"), algorithm="HS256")


def create_refresh_token(subject: str, typ: str) -> str:
    now = now_utc()
    payload = {
        "sub": subject,
        "typ": "refresh",
        "token_typ": typ,
        "jti": new_id(),
        "iat": now,
        "exp": now + timedelta(days=7),
        "iss": "smart-eelection",
    }
    return jwt.encode(payload, _secret("JWT_REFRESH_SECRET"), algorithm="HS256")


def decode_access(token: str) -> dict | None:
    try:
        return jwt.decode(token, _secret("JWT_SECRET"), algorithms=["HS256"], issuer="smart-eelection")
    except jwt.PyJWTError:
        return None


def decode_refresh(token: str) -> dict | None:
    try:
        return jwt.decode(token, _secret("JWT_REFRESH_SECRET"), algorithms=["HS256"], issuer="smart-eelection")
    except jwt.PyJWTError:
        return None


def encrypt_ballot(payload: dict) -> str:
    """AES-256-GCM authenticated encryption of the ballot payload at rest."""
    raw = base64.b64decode(os.environ["BALLOT_ENCRYPTION_KEY"])
    nonce = os.urandom(12)
    ciphertext = AESGCM(raw).encrypt(nonce, json.dumps(payload, default=str).encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt_ballot(blob: str) -> dict:
    raw = base64.b64decode(os.environ["BALLOT_ENCRYPTION_KEY"])
    data = base64.b64decode(blob)
    plaintext = AESGCM(raw).decrypt(data[:12], data[12:], None)
    return json.loads(plaintext)


def mask_ref(ref: str) -> str:
    """Display-only identity mask, e.g. 'XXXX-XXXX-1234'. The raw ref never leaves the input."""
    digits = "".join(ch for ch in ref if ch.isdigit())
    if len(digits) < 4:
        return "XXXX-XXXX-XXXX"
    return f"XXXX-XXXX-{digits[-4:]}"
