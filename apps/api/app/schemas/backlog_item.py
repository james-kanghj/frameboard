# /apps/api/app/schemas/backlog_item.py

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class BacklogItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None)


class BacklogItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    title: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    rice_score: RICEScoreRead | None = None
