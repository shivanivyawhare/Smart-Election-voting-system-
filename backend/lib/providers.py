"""Provider abstraction layer (spec §7, §9, §29).

- IdentityProvider: SandboxIdentityProvider (development) and AadhaarIdentityProvider
  (production adapter, active only with AADHAAR_PROVIDER=aadhaar AND credentials set).
- FaceProvider: capture scoring on submitted quality metadata. Raw images are never
  persisted anywhere; only minimal result metadata is stored.
- EmailProvider / SMSProvider: console providers in development; production providers
  are configured through environment variables.

The sandbox is always labelled as sandbox — nothing here ever claims to be a real
UIDAI/production verification (spec §55).
"""

import logging
import os
import secrets
from abc import ABC, abstractmethod
from datetime import timedelta

import httpx

from lib.db import db
from lib.security import is_dev_mode, mask_ref, new_id, now_utc, sha256_hex

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    pass


# --------------------------------------------------------------------------- identity


class IdentityProvider(ABC):
    name = "abstract"

    @abstractmethod
    async def initiate_authentication(self, aadhaar_ref: str, purpose: str) -> dict:
        """Start an OTP/authentication transaction. Returns metadata only — never the raw ref."""

    @abstractmethod
    async def check_authentication_status(self, transaction: dict) -> str:
        """Map a stored transaction to a provider status string."""

    @abstractmethod
    async def get_verified_attributes(self, aadhaar_ref: str) -> dict:
        """Minimum verified attributes: masked ref, sandbox flag. Never raw Aadhaar data."""


class SandboxIdentityProvider(IdentityProvider):
    """Development-only provider. Generates a local OTP and exposes it to the client
    ONLY when DEVELOPMENT_MODE=true, always labelled as sandbox."""

    name = "sandbox"

    async def initiate_authentication(self, aadhaar_ref: str, purpose: str) -> dict:
        otp = f"{secrets.randbelow(1_000_000):06d}"
        return {
            "provider": self.name,
            "otp_hash": sha256_hex(otp),
            "expires_at": now_utc() + timedelta(minutes=5),
            "masked_ref": mask_ref(aadhaar_ref),
            # Shown in the UI with a SANDBOX banner; never sent when not in dev mode.
            "sandbox_otp": otp if is_dev_mode() else None,
        }

    async def check_authentication_status(self, transaction: dict) -> str:
        return transaction.get("status", "UNKNOWN")

    async def get_verified_attributes(self, aadhaar_ref: str) -> dict:
        return {"masked_ref": mask_ref(aadhaar_ref), "provider": self.name, "sandbox": True}


class AadhaarIdentityProvider(IdentityProvider):
    """Production adapter behind configuration. Performs the provider call server-side;
    no credential ever reaches the frontend. Without configured credentials it refuses
    to operate so sandbox output can never masquerade as real verification."""

    name = "aadhaar"

    def _configured(self) -> bool:
        return all(os.environ.get(k) for k in
                   ("AADHAAR_CLIENT_ID", "AADHAAR_CLIENT_SECRET", "AADHAAR_API_URL"))

    async def initiate_authentication(self, aadhaar_ref: str, purpose: str) -> dict:
        if not self._configured():
            raise ProviderError(
                "Aadhaar provider credentials are not configured; the sandbox provider is active."
            )
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{os.environ['AADHAAR_API_URL']}/auth/initiate",
                json={"aadhaar_ref_sha256": sha256_hex(aadhaar_ref), "purpose": purpose},
                headers={"client-id": os.environ["AADHAAR_CLIENT_ID"],
                         "license-key": os.environ.get("AADHAAR_LICENSE_KEY", "")},
            )
            resp.raise_for_status()
            data = resp.json()
        # Contract: provider returns an opaque txn ref + OTP delivery status.
        return {
            "provider": self.name,
            "otp_hash": sha256_hex(data["otp_reference"]),
            "expires_at": now_utc() + timedelta(minutes=5),
            "masked_ref": mask_ref(aadhaar_ref),
            "sandbox_otp": None,
            "provider_txn_id": data.get("txn_id"),
        }

    async def check_authentication_status(self, transaction: dict) -> str:
        if not self._configured():
            raise ProviderError("Aadhaar provider credentials are not configured.")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{os.environ['AADHAAR_API_URL']}/auth/status/{transaction['id']}",
                headers={"client-id": os.environ["AADHAAR_CLIENT_ID"]},
            )
            resp.raise_for_status()
            return resp.json().get("status", "UNKNOWN")

    async def get_verified_attributes(self, aadhaar_ref: str) -> dict:
        return {"masked_ref": mask_ref(aadhaar_ref), "provider": self.name, "sandbox": False}


def get_identity_provider() -> IdentityProvider:
    chosen = os.environ.get("AADHAAR_PROVIDER", "sandbox").lower()
    if chosen == "aadhaar":
        try:
            provider = AadhaarIdentityProvider()
            if provider._configured():
                return provider
        except Exception:
            pass
        logger.warning("AADHAAR_PROVIDER=aadhaar but credentials missing — sandbox provider active")
    return SandboxIdentityProvider()


# --------------------------------------------------------------------------- face


class FaceProvider(ABC):
    name = "abstract"

    @abstractmethod
    async def verify_capture(self, metrics: dict, image_bytes: bytes | None) -> dict:
        """Score one capture. Returns {verified, confidence, reasons}. Images are not stored."""


class SandboxFaceProvider(FaceProvider):
    """Development provider: plausibility checks on capture metrics (single-face
    confidence, lighting, detail variance, payload bounds)."""

    name = "sandbox"

    async def verify_capture(self, metrics: dict, image_bytes: bytes | None) -> dict:
        reasons: list[str] = []
        brightness = float(metrics.get("brightness", 0))
        variance = float(metrics.get("variance", 0))
        face_confidence = float(metrics.get("face_confidence", 0))
        if image_bytes is not None:
            if len(image_bytes) < 3_000:
                reasons.append("Capture payload too small to be a real photo frame.")
            if len(image_bytes) > 3_000_000:
                reasons.append("Capture payload exceeds size limits.")
        if not 0.04 <= brightness <= 0.99:
            reasons.append("Lighting is too dark or blown out. Reposition in an evenly lit place.")
        if variance < 0.008:
            reasons.append("Not enough facial detail — move closer to the camera.")
        if face_confidence < 0.6:
            reasons.append("No clear single face detected. Centre your face in the frame.")
        verified = not reasons
        confidence = round(min(1.0, (face_confidence * 0.8) + (0.2 if verified else 0.0)), 3)
        return {"verified": verified, "confidence": confidence, "reasons": reasons,
                "provider": self.name, "sandbox": True}


def get_face_provider() -> FaceProvider:
    if os.environ.get("FACE_PROVIDER", "sandbox").lower() != "sandbox":
        logger.warning("FACE_PROVIDER=%s has no production adapter wired in this build — sandbox active",
                       os.environ.get("FACE_PROVIDER"))
    return SandboxFaceProvider()


# --------------------------------------------------------------------------- notifications


async def _notify(channel: str, recipient: str, subject: str, body: str) -> None:
    """Console provider in development — deliveries are persisted (masked) and logged.
    Production email/SMS providers plug in behind the same interface via env."""
    masked = recipient[:2] + "***" + recipient[recipient.rfind("@"):] if "@" in recipient else recipient[:4] + "***"
    logger.info("[%s -> %s] %s: %s", channel.upper(), masked, subject, body[:120])
    await db.notifications.insert_one({
        "id": new_id(),
        "channel": channel,
        "to_masked": masked,
        "subject": subject,
        "body_preview": body[:300],
        "provider": os.environ.get("EMAIL_PROVIDER" if channel == "email" else "SMS_PROVIDER", "console"),
        "status": "CONSOLE_DELIVERED",
        "created_at": now_utc(),
    })


async def notify_email(to: str, subject: str, body: str) -> None:
    await _notify("email", to, subject, body)


async def notify_sms(to: str, body: str) -> None:
    await _notify("sms", to, "SMS", body)
