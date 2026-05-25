# /apps/api/app/schemas/prioritization.py

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RICEScoreRequest(BaseModel):
    item_id: UUID = Field(..., description="Backlog item UUID")
    reach: float = Field(..., ge=0, description="Users/events affected per period")
    impact: Literal[0.25, 0.5, 1, 2, 3] = Field(..., description="RICE impact scale")
    confidence: float = Field(..., ge=0, le=1, description="0.0–1.0 confidence")
    effort: float = Field(..., gt=0, description="Person-months")


class ICEScoreRequest(BaseModel):
    item_id: str = Field(..., description="Arbitrary identifier; ICE is not persisted")
    impact: float = Field(..., ge=1, le=10)
    confidence: float = Field(..., ge=1, le=10)
    ease: float = Field(..., ge=1, le=10)


class PrioritizationResult(BaseModel):
    framework: str
    item_id: str
    score: float
    breakdown: dict[str, float]
