# /apps/api/app/api/prioritization.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, require_workspace_member
from app.crud import backlog_item as item_crud
from app.crud import item_score as item_score_crud
from app.crud import rice_score as rice_crud
from app.db.session import get_db
from app.models.backlog_item import BacklogItem
from app.models.workspace import Workspace
from app.schemas.backlog_item import BacklogItemRead
from app.schemas.prioritization import (
    ICEScoreRequest,
    PrioritizationResult,
    RICEScoreRequest,
)
from app.schemas.score import ScoreRead, ScoreRequest, validate_inputs
from app.services.frameworks import SUPPORTED_FRAMEWORKS
from app.services.score_engine import compute as compute_score

router = APIRouter()


def _load_owned_item(
    db: Session, *, item_id: UUID, current_user_id: UUID
) -> BacklogItem:
    """Mirror of items._load_owned_item — accepts the workspace owner
    OR any invited member. Duplicated rather than imported across
    routers to keep the inter-router dependency graph flat."""
    item = item_crud.get_item(db, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    if item.workspace.owner_id == current_user_id:
        return item
    from app.crud import workspace_member as member_crud

    membership = member_crud.get_membership(
        db,
        workspace_id=item.workspace_id,
        user_id=current_user_id,
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    return item


@router.post("/score/rice", response_model=PrioritizationResult)
def score_rice(
    payload: RICEScoreRequest,
    current_user: CurrentUser,
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
    _load_owned_item(db, item_id=payload.item_id, current_user_id=current_user.id)
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
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> ScoreRead:
    """Unified scoring endpoint. Validates inputs against the per-framework
    schema, computes the numeric score, and upserts in either `rice_scores`
    (for RICE — to keep the legacy board path consistent) or `item_scores`
    (for ICE / MoSCoW / ValueEffort)."""
    _load_owned_item(db, item_id=payload.item_id, current_user_id=current_user.id)
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
    preferred for new clients. No auth required because nothing leaves
    or enters the DB."""
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
    workspace: Workspace = Depends(require_workspace_member),
    db: Session = Depends(get_db),
) -> list[BacklogItemRead]:
    """Board view: workspace items ordered by score DESC for the workspace's
    framework, with unscored items at the end (by created_at ASC). RICE
    workspaces read from `rice_scores`; the other frameworks read from the
    polymorphic `item_scores` table."""
    if workspace.framework == "RICE":
        return rice_crud.list_board(db, workspace_id=workspace.id)

    items = item_crud.list_items(db, workspace_id=workspace.id)
    scores_map = item_score_crud.list_scores_for_workspace(
        db,
        workspace_id=workspace.id,
        framework=workspace.framework,
    )

    def sort_key(it):
        # Completed items sink to the bottom; within each group, scored
        # items lead by score DESC, then unscored by created_at ASC.
        is_completed = 1 if it.completed_at else 0
        row = scores_map.get(it.id)
        if row is None:
            return (is_completed, 1, 0, it.created_at)
        return (is_completed, 0, -row.score, it.created_at)

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
                completed_at=it.completed_at,
                rice_score=None,
                score=ScoreRead.model_validate(score_row) if score_row else None,
            )
        )
    return result


@router.delete("/items/{item_id}/rice", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_rice(
    item_id: UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    """Reset an item back to 'unscored' under RICE. Idempotent on unscored
    items, 404 if the item doesn't exist or isn't owned."""
    _load_owned_item(db, item_id=item_id, current_user_id=current_user.id)
    rice_crud.delete_rice_score(db, item_id)


@router.delete("/items/{item_id}/score", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_polymorphic_score(
    item_id: UUID,
    current_user: CurrentUser,
    framework: str = Query(
        ...,
        description="Framework to clear: ICE | MoSCoW | ValueEffort | RICE",
    ),
    db: Session = Depends(get_db),
) -> None:
    if framework not in SUPPORTED_FRAMEWORKS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"framework must be one of {SUPPORTED_FRAMEWORKS}",
        )
    _load_owned_item(db, item_id=item_id, current_user_id=current_user.id)
    if framework == "RICE":
        rice_crud.delete_rice_score(db, item_id)
        return
    item_score_crud.delete_score(db, item_id=item_id, framework=framework)
