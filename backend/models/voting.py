"""Identity verification, face/liveness and voting models.

Privacy invariants: no model ever carries a raw Aadhaar number, OTP, PID block,
biometric template or a readable voter→candidate mapping.
"""

from datetime import datetime

from pydantic import BaseModel, Field


# ------------------------------------------------------------------ identity


class ConsentCreate(BaseModel):
    purpose: str = Field(default="voting", max_length=80)


class IdentityInitiate(BaseModel):
    consent_id: str
    # 12 digits, numeric — validated for format only; the value is never stored.
    aadhaar_ref: str = Field(min_length=12, max_length=12, pattern=r"^[0-9]{12}$")


class IdentityInitiateOut(BaseModel):
    transaction_id: str
    provider: str
    status: str
    masked_ref: str
    expires_at: datetime
    sandbox_otp: str | None = None
    sandbox_notice: str | None = None


class IdentityVerifyOtp(BaseModel):
    transaction_id: str
    otp: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


class IdentityVerificationOut(BaseModel):
    id: str
    voter_id: str
    provider: str
    status: str
    purpose: str
    masked_ref: str
    consent_timestamp: datetime
    risk_score: float
    created_at: datetime
    verified_at: datetime | None = None


# ------------------------------------------------------------------ face / liveness


class FaceSessionCreate(BaseModel):
    purpose: str = Field(default="voting", max_length=80)


class FaceSessionOut(BaseModel):
    session_id: str
    status: str
    expires_at: datetime


class FaceVerifyIn(BaseModel):
    session_id: str
    image: str  # data URL; analysed then discarded — never persisted
    brightness: float = Field(ge=0, le=1)
    variance: float = Field(ge=0, le=1)
    face_confidence: float = Field(ge=0, le=1)
    simulated: bool = False  # true when the environment has no camera (sandbox only)


class FaceVerifyOut(BaseModel):
    status: str  # VERIFIED | FAILED | RETRY_REQUIRED | LOCKED
    confidence: float
    reasons: list[str]
    attempts_remaining: int
    provider: str
    sandbox: bool


# ------------------------------------------------------------------ liveness


class LivenessStartOut(BaseModel):
    session_id: str
    nonce: str
    challenges: list[str]
    expires_at: datetime


class LivenessVerifyIn(BaseModel):
    session_id: str
    nonce: str
    frames: list[str] = Field(min_length=1, max_length=6)
    timings_ms: list[int] = Field(min_length=1, max_length=6)


class LivenessVerifyOut(BaseModel):
    status: str  # VERIFIED | FAILED | RETRY_REQUIRED | LOCKED
    reasons: list[str]
    attempts_remaining: int
    sandbox: bool = True


# ------------------------------------------------------------------ voting


class VotingSessionCreate(BaseModel):
    election_id: str


class VotingSessionOut(BaseModel):
    session_id: str
    election_id: str
    status: str
    expires_at: datetime
    eligibility: dict


class VoteCastIn(BaseModel):
    voting_session_id: str
    election_id: str
    candidate_id: str
    confirm: bool


class ReceiptOut(BaseModel):
    receipt_id: str
    election_id: str
    commitment: str
    block_index: int | None = None
    created_at: datetime
