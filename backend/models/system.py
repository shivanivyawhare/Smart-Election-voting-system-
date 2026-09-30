"""System/admin models: admin auth (MFA), settings, contact, result publication."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class MfaVerify(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")


class AdminCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=3, max_length=120)
    role: str = "ELECTION_ADMIN"
    password: str = Field(min_length=10, max_length=128)


class SettingUpdate(BaseModel):
    settings: dict[str, str]


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=10, max_length=4000)


class ResultPublishIn(BaseModel):
    confirm: bool = True
