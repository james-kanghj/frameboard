# /apps/api/app/api/users.py
#
# `GET / PATCH /v1/users/me` for the authenticated user's settings.
# Currently exposes only Notion-integration fields; future settings
# (timezone, theme, etc.) slot onto the same endpoints.

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db

router = APIRouter(prefix="/users")


class UserMeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    # Plain `str` (not `EmailStr`) — email-validator rejects reserved
    # TLDs like `.test` / `.local`, and this is a read-side response,
    # not a write-side validator. The address was already vetted when
    # it came through OAuth or got persisted upstream.
    email: str
    display_name: str
    created_at: datetime
    # Don't echo back the token itself — only whether one is set, so
    # the frontend can render "configured / not configured" without
    # ever holding the raw secret.
    notion_configured: bool = False
    notion_database_id: str | None = None
    linear_configured: bool = False
    linear_team_id: str | None = None


class UserMeUpdate(BaseModel):
    notion_access_token: str | None = Field(default=None, max_length=255)
    notion_database_id: str | None = Field(default=None, max_length=64)
    linear_api_key: str | None = Field(default=None, max_length=255)
    linear_team_id: str | None = Field(default=None, max_length=64)


def _to_read(user) -> UserMeRead:  # noqa: ANN001 — ORM row
    return UserMeRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        created_at=user.created_at,
        notion_configured=bool(user.notion_access_token),
        notion_database_id=user.notion_database_id,
        linear_configured=bool(user.linear_api_key),
        linear_team_id=user.linear_team_id,
    )


@router.get("/me", response_model=UserMeRead)
def get_me(current_user: CurrentUser) -> UserMeRead:
    return _to_read(current_user)


@router.patch("/me", response_model=UserMeRead)
def update_me(
    payload: UserMeUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> UserMeRead:
    """Partial update — only the fields the caller sends are written.
    Pass an empty string for a token field to clear it (disconnect)."""
    fields = payload.model_dump(exclude_unset=True)
    # Treat empty string as "disconnect" so the frontend can clear an
    # integration without a dedicated DELETE endpoint.
    if "notion_access_token" in fields:
        current_user.notion_access_token = fields["notion_access_token"] or None
    if "notion_database_id" in fields:
        current_user.notion_database_id = fields["notion_database_id"] or None
    if "linear_api_key" in fields:
        current_user.linear_api_key = fields["linear_api_key"] or None
    if "linear_team_id" in fields:
        current_user.linear_team_id = fields["linear_team_id"] or None
    db.commit()
    db.refresh(current_user)
    return _to_read(current_user)
