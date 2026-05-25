# /apps/api/app/schemas/workspace.py

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.services.frameworks import (
    DEFAULT_FRAMEWORK,
    SUPPORTED_FRAMEWORKS,
    Framework,
)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str
    created_at: datetime


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    framework: Framework = DEFAULT_FRAMEWORK
    # `owner_email` is intentionally absent — the owner is derived from
    # the authenticated session (or the dev user under AUTH_DISABLED=1).
    # Self-host contributors don't need to track emails manually.


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    framework: Framework | None = None

    @field_validator("framework")
    @classmethod
    def _check_framework(cls, v: str | None) -> str | None:
        if v is not None and v not in SUPPORTED_FRAMEWORKS:
            raise ValueError(
                f"framework must be one of {SUPPORTED_FRAMEWORKS}"
            )
        return v


class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    framework: Framework
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
