# /apps/api/app/schemas/backlog_item.py

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.score import ScoreRead

# Tag normalisation rules — applied uniformly on create and update so
# the DB never holds two equivalent tags ("Infra" vs "infra"), oversized
# strings, or empty entries.
MAX_TAGS_PER_ITEM = 10
MAX_TAG_LENGTH = 30


def _normalise_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in tags:
        if not isinstance(raw, str):
            continue
        t = raw.strip()
        if not t or len(t) > MAX_TAG_LENGTH:
            continue
        key = t.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(t)
        if len(result) >= MAX_TAGS_PER_ITEM:
            break
    return result


class RICEScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reach: float
    impact: float
    confidence: float
    effort: float
    score: float
    updated_at: datetime


class BacklogItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _norm(cls, v: list[str]) -> list[str]:
        return _normalise_tags(v)


class BacklogItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None)
    # `None` means "do not update". `[]` clears all tags.
    tags: list[str] | None = Field(default=None)

    @field_validator("tags")
    @classmethod
    def _norm(cls, v: list[str] | None) -> list[str] | None:
        return _normalise_tags(v) if v is not None else None


class BacklogItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    title: str
    description: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    # RICE-specific score from the legacy `rice_scores` table. Populated
    # for RICE workspaces; None for non-RICE workspaces (which use the
    # polymorphic `score` field below). Kept as a separate field for
    # backward compatibility with existing frontend code.
    rice_score: RICEScoreRead | None = None
    # Polymorphic score for non-RICE frameworks (ICE / MoSCoW /
    # ValueEffort). Populated only by the board endpoint, where the
    # workspace's framework is known. Defaults to None on other endpoints.
    score: ScoreRead | None = None
