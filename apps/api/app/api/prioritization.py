/apps/api/app/api/prioritization.py

from fastapi import APIRouter, HTTPException

from app.schemas.prioritization import (
    ICEScoreRequest,
    PrioritizationResult,
    RICEScoreRequest,
)

router = APIRouter()


@router.post("/score/rice", response_model=PrioritizationResult)
async def score_rice(payload: RICEScoreRequest) -> PrioritizationResult:
    """
    RICE = (Reach * Impact * Confidence) / Effort

    - Reach: estimated users/events affected per time period
    - Impact: 0.25 (minimal), 0.5 (low), 1 (medium), 2 (high), 3 (massive)
    - Confidence: 0.0–1.0
    - Effort: person-months (must be > 0)
    """
    if payload.effort <= 0:
        raise HTTPException(status_code=422, detail="effort must be greater than 0")

    score = (payload.reach * payload.impact * payload.confidence) / payload.effort
    return PrioritizationResult(
        framework="RICE",
        item_id=payload.item_id,
        score=round(score, 2),
        breakdown={
            "reach": payload.reach,
            "impact": payload.impact,
            "confidence": payload.confidence,
            "effort": payload.effort,
        },
    )


@router.post("/score/ice", response_model=PrioritizationResult)
async def score_ice(payload: ICEScoreRequest) -> PrioritizationResult:
    """
    ICE = Impact * Confidence * Ease (each on 1–10 scale)
    """
    score = payload.impact * payload.confidence * payload.ease
    return PrioritizationResult(
        framework="ICE",
        item_id=payload.item_id,
        score=round(score, 2),
        breakdown={
            "impact": payload.impact,
            "confidence": payload.confidence,
            "ease": payload.ease,
        },
    )
