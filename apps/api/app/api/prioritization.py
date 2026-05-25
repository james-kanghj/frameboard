# /apps/api/app/api/prioritization.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud import backlog_item as item_crud
from app.crud import rice_score as rice_crud
from app.crud import workspace as workspace_crud
from app.db.session import get_db
from app.schemas.backlog_item import BacklogItemRead
from app.schemas.prioritization import (
    ICEScoreRequest,
    PrioritizationResult,
    RICEScoreRequest,
)

router = APIRouter()


@router.post("/score/rice", response_model=PrioritizationResult)
def score_rice(
    payload: RICEScoreRequest,
    db: Session = Depends(get_db),
) -> PrioritizationResult:
    """
    RICE = (Reach * Impact * Confidence) / Effort

    Persists to rice_scores keyed on item_id (one row per item — second call
    for the same item updates in place rather than inserting).

    - Reach: estimated users/events affected per time period
    - Impact: 0.25 (minimal), 0.5 (low), 1 (medium), 2 (high), 3 (massive)
    - Confidence: 0.0–1.0
    - Effort: person-months (must be > 0)
    """
    if item_crud.get_item(db, payload.item_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    rice = rice_crud.upsert_rice_score(
        db,
        item_id=payload.item_id,
        reach=payload.reach,
        impact=payload.impact,
        confidence=payload.confidence,
        effort=payload.effort,
    )
    return PrioritizationResult(
        framework="RICE",
        item_id=str(payload.item_id),
        score=rice.score,
        breakdown={
            "reach": rice.reach,
            "impact": rice.impact,
            "confidence": rice.confidence,
            "effort": rice.effort,
        },
    )


@router.post("/score/ice", response_model=PrioritizationResult)
def score_ice(payload: ICEScoreRequest) -> PrioritizationResult:
    """ICE = Impact * Confidence * Ease (each on 1–10 scale). Not persisted —
    treated as a lightweight calculator, so item_id is a free-form string."""
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


@router.get("/workspaces/{workspace_id}/board", response_model=list[BacklogItemRead])
def get_board(
    workspace_id: UUID,
    db: Session = Depends(get_db),
) -> list[BacklogItemRead]:
    """Board view: workspace items ordered by RICE score DESC, then unscored
    items by created_at ASC."""
    if workspace_crud.get_workspace(db, workspace_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    return rice_crud.list_board(db, workspace_id=workspace_id)


@router.delete("/items/{item_id}/rice", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_rice(item_id: UUID, db: Session = Depends(get_db)) -> None:
    """Reset an item back to 'unscored'. Idempotent on unscored items, but
    404s if the item itself doesn't exist."""
    if item_crud.get_item(db, item_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    rice_crud.delete_rice_score(db, item_id)
