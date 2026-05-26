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
    # Omitted from the request body → leave alone. Explicit `null` →
    # mark item as open (clear completion). ISO datetime string → mark
    # completed at that moment. The router uses `exclude_unset=True`
    # so the three cases stay distinguishable.
    completed_at: datetime | None = Field(default=None)

    @field_validator("tags")
    @classmethod
    def _norm(cls, v: list[str] | None) -> list[str] | None:
        return _normalise_tags(v) if v is not None else None


class ScoreAggregate(BaseModel):
    """Mean / min / max + variance + contributor count across every
    member who has scored this item. Drives the Phase-C disagreement
    visualization on the board."""

    score: float
    contributor_count: int
    variance: float
    min: float
    max: float


class BacklogItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    title: str
    description: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    # Null = open, timestamp = shipped at that moment.
    completed_at: datetime | None = None
    # The caller's own RICE score (their reach/impact/confidence/effort
    # row). Null when the caller hasn't scored this item yet — another
    # member may have, in which case `rice_aggregate` is populated.
    rice_score: RICEScoreRead | None = None
    # Mean across every member's RICE row + variance + contributor
    # count. Populated only by the board endpoint on RICE workspaces.
    rice_aggregate: ScoreAggregate | None = None
    # Polymorphic version of `rice_score` for ICE / MoSCoW /
    # ValueEffort workspaces — the caller's own score.
    score: ScoreRead | None = None
    # Polymorphic aggregate (mean + variance + count) for non-RICE
    # workspaces.
    score_aggregate: ScoreAggregate | None = None
