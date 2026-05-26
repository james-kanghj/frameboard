# /apps/api/app/schemas/score.py
#
# Per-framework input schemas + a discriminated-union envelope. The
# router pulls `framework` first, then dispatches the inputs body
# through the right validator - invalid combinations (e.g. RICE with
# effort=0) fail at the API boundary, not inside the engine.

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.services.frameworks import Framework


class RICEInputs(BaseModel):
    reach: float = Field(..., ge=0)
    impact: float = Field(..., ge=0)
    confidence: float = Field(..., ge=0, le=1)
    effort: float = Field(..., gt=0)


class ICEInputs(BaseModel):
    # ICE traditionally uses 1–10 scales; we accept any non-negative number
    # so PMs can use their own conventions (e.g. 0–5).
    impact: float = Field(..., ge=0)
    confidence: float = Field(..., ge=0)
    ease: float = Field(..., ge=0)


class ValueEffortInputs(BaseModel):
    value: float = Field(..., ge=0)
    effort: float = Field(..., gt=0)


class MoSCoWInputs(BaseModel):
    bucket: Literal["Must", "Should", "Could", "Won't"]


# Discriminator-free envelope: the router branches on `framework` and
# parses `inputs` with the matching submodel. Keeping inputs as a plain
# dict in the wire schema lets us avoid Pydantic's discriminated-union
# friction (single tag spread across nested fields) while still
# validating at the boundary.
class ScoreRequest(BaseModel):
    item_id: UUID
    framework: Framework
    inputs: dict[str, Any]


class ScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: UUID
    framework: Framework
    inputs: dict[str, Any]
    score: float
    updated_at: datetime


INPUT_SCHEMA_BY_FRAMEWORK: dict[
    str, type[BaseModel]
] = {
    "RICE": RICEInputs,
    "ICE": ICEInputs,
    "ValueEffort": ValueEffortInputs,
    "MoSCoW": MoSCoWInputs,
}


def validate_inputs(framework: str, inputs: dict[str, Any]) -> dict[str, Any]:
    """Re-parse the inputs dict through the matching per-framework schema.
    Returns the normalised dict (Pydantic strips unknown keys). Raises
    pydantic.ValidationError on shape mismatches, which FastAPI converts
    into a 422."""
    schema = INPUT_SCHEMA_BY_FRAMEWORK.get(framework)
    if schema is None:
        raise ValueError(f"unknown framework: {framework!r}")
    parsed = schema.model_validate(inputs)
    return parsed.model_dump()


__all__ = [
    "ICEInputs",
    "INPUT_SCHEMA_BY_FRAMEWORK",
    "MoSCoWInputs",
    "RICEInputs",
    "ScoreRead",
    "ScoreRequest",
    "ValueEffortInputs",
    "validate_inputs",
]
