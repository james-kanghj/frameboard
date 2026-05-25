# /apps/api/app/api/prioritization.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.crud import backlog_item as item_crud
from app.crud import item_score as item_score_crud
from app.crud import rice_score as rice_crud
from app.crud import workspace as workspace_crud
from app.schemas.backlog_item import BacklogItemRead
from app.schemas.prioritization import (
    ICEScoreRequest,
    PrioritizationResult,
    RICEScoreRequest,
)
from app.schemas.score import ScoreRead, ScoreRequest, validate_inputs
from app.services.frameworks import SUPPORTED_FRAMEWORKS
from app.services.score_engine import compute as compute_score
from app.db.session import get_db

router = APIRouter()


@router.post("/score/rice", response_model=PrioritizationResult)
def score_rice(
    payload: RICEScoreRequest,
    db: Session = Depends(get_db),
) -> PrioritizationResult:
    """RICE-specific endpoint kept for backward compatibility. The unified
    `POST /v1/score` is preferred for new clients; both write to
    `rice_scores` for RICE so the board endpoint sees a consistent view.

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


@router.post("/score", response_model=ScoreRead)
def score_item(
    payload: ScoreRequest,
    db: Session = Depends(get_db),
) -> ScoreRead:
    """Unified scoring endpoint. Validates inputs against the per-framework
    schema, computes the numeric score, and upserts in either `rice_scores`
    (for RICE — to keep the legacy board path consistent) or `item_scores`
    (for ICE / MoSCoW / ValueEffort). Returns the persisted score envelope
    so the client can render without a follow-up read."""
    if item_crud.get_item(db, payload.item_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    try:
        normalised = validate_inputs(payload.framework, payload.inputs)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.errors()
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e

    score_value = compute_score(payload.framework, normalised)

    if payload.framework == "RICE":
        # Land in the legacy table so the existing board read path
        # continues to work unchanged. Inputs were validated above so the
        # dict access is safe.
        rice = rice_crud.upsert_rice_score(
            db,
            item_id=payload.item_id,
            reach=normalised["reach"],
            impact=normalised["impact"],
            confidence=normalised["confidence"],
            effort=normalised["effort"],
        )
        return ScoreRead(
            item_id=payload.item_id,
            framework="RICE",
            inputs=normalised,
            score=rice.score,
            updated_at=rice.updated_at,
        )

    row = item_score_crud.upsert_score(
        db,
        item_id=payload.item_id,
        framework=payload.framework,
        inputs=normalised,
        score=score_value,
    )
    return ScoreRead.model_validate(row)


@router.post("/score/ice", response_model=PrioritizationResult)
def score_ice(payload: ICEScoreRequest) -> PrioritizationResult:
    """Legacy lightweight ICE calculator — not persisted. The unified
    `POST /v1/score` with `framework: "ICE"` persists per-item and is
    preferred for new clients."""
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
    """Board view: workspace items ordered by score DESC for the workspace's
    framework, with unscored items at the end (by created_at ASC). RICE
    workspaces read from `rice_scores`; the other frameworks read from the
    polymorphic `item_scores` table."""
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    if workspace.framework == "RICE":
        # Existing path — already returns items with rice_score populated.
        return rice_crud.list_board(db, workspace_id=workspace_id)

    items = item_crud.list_items(db, workspace_id=workspace_id)
    scores_map = item_score_crud.list_scores_for_workspace(
        db,
        workspace_id=workspace_id,
        framework=workspace.framework,
    )

    def sort_key(it):
        # Scored items come first, sorted by score DESC; unscored fall
        # back to created_at ASC. Mirrors the RICE board ordering.
        row = scores_map.get(it.id)
        if row is None:
            return (1, 0, it.created_at)
        return (0, -row.score, it.created_at)

    items_sorted = sorted(items, key=sort_key)
    result: list[BacklogItemRead] = []
    for it in items_sorted:
        score_row = scores_map.get(it.id)
        result.append(
            BacklogItemRead(
                id=it.id,
                workspace_id=it.workspace_id,
                title=it.title,
                description=it.description,
                tags=it.tags,
                created_at=it.created_at,
                updated_at=it.updated_at,
                # In a non-RICE workspace, the legacy rice_score field
                # stays empty even if the item has historic RICE data —
                # board view follows the workspace's current framework.
                rice_score=None,
                score=ScoreRead.model_validate(score_row) if score_row else None,
            )
        )
    return result


@router.delete("/items/{item_id}/rice", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_rice(item_id: UUID, db: Session = Depends(get_db)) -> None:
    """Reset an item back to 'unscored' under RICE. Idempotent on unscored
    items, 404 if the item itself doesn't exist."""
    if item_crud.get_item(db, item_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    rice_crud.delete_rice_score(db, item_id)


@router.delete("/items/{item_id}/score", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_polymorphic_score(
    item_id: UUID,
    framework: str = Query(..., description="Framework to clear: ICE | MoSCoW | ValueEffort | RICE"),
    db: Session = Depends(get_db),
) -> None:
    """Unified score-clear. For RICE delegates to the legacy delete so the
    existing item_history hooks fire correctly; for other frameworks
    removes the matching item_scores row."""
    if framework not in SUPPORTED_FRAMEWORKS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"framework must be one of {SUPPORTED_FRAMEWORKS}",
        )
    if item_crud.get_item(db, item_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    if framework == "RICE":
        rice_crud.delete_rice_score(db, item_id)
        return
    item_score_crud.delete_score(db, item_id=item_id, framework=framework)
