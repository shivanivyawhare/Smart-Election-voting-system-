"""Election-domain models: constituencies, candidates, elections + lifecycle transitions."""

from datetime import datetime

from pydantic import BaseModel, Field

ELECTION_STATUSES = ["DRAFT", "SCHEDULED", "OPEN", "PAUSED", "CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"]

# The legal lifecycle. Anything not listed is rejected server-side (spec §15).
ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "DRAFT": ["SCHEDULED"],
    "SCHEDULED": ["OPEN"],
    "OPEN": ["PAUSED", "CLOSED"],
    "PAUSED": ["OPEN", "CLOSED"],
    "CLOSED": ["COUNTING"],
    "COUNTING": ["RESULTS_PUBLISHED"],
    "RESULTS_PUBLISHED": ["ARCHIVED"],
    "ARCHIVED": [],
}


class ConstituencyCreate(BaseModel):
    code: str = Field(min_length=2, max_length=16)
    name: str = Field(min_length=3, max_length=120)
    state: str = Field(min_length=2, max_length=60)
    district: str = Field(min_length=2, max_length=60)


class Constituency(BaseModel):
    id: str
    code: str
    name: str
    state: str
    district: str
    created_at: datetime


class CandidateCreate(BaseModel):
    election_id: str
    constituency_id: str
    name: str = Field(min_length=3, max_length=120)
    party: str = Field(min_length=2, max_length=80)
    symbol: str = Field(min_length=1, max_length=8)
    description: str = Field(default="", max_length=2000)
    photo_url: str | None = Field(default=None, max_length=400)


class CandidateUpdate(BaseModel):
    name: str | None = None
    party: str | None = None
    symbol: str | None = Field(default=None, max_length=8)
    description: str | None = None
    photo_url: str | None = None
    constituency_id: str | None = None
    status: str | None = None  # ACTIVE | INACTIVE


class Candidate(BaseModel):
    id: str
    election_id: str
    constituency_id: str
    name: str
    party: str
    symbol: str
    description: str
    photo_url: str | None = None
    status: str = "ACTIVE"
    created_at: datetime


class ElectionCreate(BaseModel):
    name: str = Field(min_length=4, max_length=160)
    election_code: str = Field(min_length=3, max_length=24)
    description: str = Field(default="", max_length=3000)
    election_type: str = "GENERAL"  # GENERAL | ASSEMBLY | LOCAL | BYE
    start_at: datetime
    end_at: datetime
    constituency_ids: list[str] = Field(min_length=1)


class ElectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    election_type: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    constituency_ids: list[str] | None = None


class Election(BaseModel):
    id: str
    election_code: str
    name: str
    description: str
    election_type: str
    status: str
    start_at: datetime
    end_at: datetime
    constituency_ids: list[str]
    auto_closed: bool = False
    results_published_at: datetime | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class TransitionRequest(BaseModel):
    status: str
