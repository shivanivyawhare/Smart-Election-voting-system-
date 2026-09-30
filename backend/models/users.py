"""Voter + admin models. Every response model here has a hand-written TS mirror in
frontend/src/lib/types.ts — keep the pair in sync in the same edit (TEMPLATE.md §4)."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class VoterRegister(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    date_of_birth: str = Field(min_length=10, max_length=10)  # YYYY-MM-DD
    mobile: str = Field(min_length=10, max_length=15)
    email: EmailStr
    state: str = Field(min_length=2, max_length=60)
    district: str = Field(min_length=2, max_length=60)
    constituency_id: str
    voter_ref: str = Field(min_length=6, max_length=24, description="Electoral roll reference (never an Aadhaar number)")
    password: str = Field(min_length=8, max_length=128)


class VoterLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VoterOut(BaseModel):
    id: str
    full_name: str
    email: str
    mobile: str
    date_of_birth: str
    state: str
    district: str
    constituency_id: str | None = None
    voter_ref_masked: str
    status: str  # PENDING | APPROVED | SUSPENDED
    suspended: bool = False
    identity_verified: bool = False
    face_verified: bool = False
    liveness_verified: bool = False
    identity_masked: str | None = None
    created_at: datetime


class VoterAdminOut(VoterOut):
    has_voted_current: bool | None = None


class AdminOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str  # SUPER_ADMIN | ELECTION_ADMIN | AUDITOR | RESULTS_OFFICER | SECURITY_OFFICER
    status: str = "ACTIVE"
    failed_attempts: int = 0
    locked_until: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class AuthMe(BaseModel):
    authenticated: bool
    role_type: str | None = None  # "voter" | "admin"
    user: VoterOut | AdminOut | None = None


class AdminLoginStep1Out(BaseModel):
    mfa_required: bool = True
    mfa_token: str
    sandbox_code: str | None = None  # only in DEVELOPMENT_MODE, clearly labelled sandbox
