# /apps/api/app/crud/rice_score.py

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, nulls_last, select, update
from sqlalchemy.orm import Session, selectinload

from app.crud import item_history as history_crud
from app.models.backlog_item import BacklogItem
from app.models.rice_score import RICEScore


def _touch_item(db: Session, item_id: UUID) -> None:
    """Bump the parent BacklogItem's `updated_at` so the item reflects
    scoring activity. Without this, score-only changes are invisible to
    any future 'recently modified items' feature — only RICEScore.updated_at
    moves on its own."""
    db.execute(
        update(BacklogItem)
        .where(BacklogItem.id == item_id)
        .values(updated_at=func.now())
    )


def upsert_rice_score(
    db: Session,
    *,
    item_id: UUID,
    reach: float,
    impact: float,
    confidence: float,
    effort: float,
) -> RICEScore:
    score_value = RICEScore.compute(
        reach=reach, impact=impact, confidence=confidence, effort=effort
    )
    existing = db.execute(
        select(RICEScore).where(RICEScore.item_id == item_id)
    ).scalar_one_or_none()
    # Snapshot the pre-write state for the history row. We pass the
    # full ORM object — record_score_change skips writing if nothing
    # actually changed (e.g. PATCH re-saving identical numbers).
    history_crud.record_score_change(
        db,
        item_id=item_id,
        before=existing,
        after_values={
            "reach": reach,
            "impact": impact,
            "confidence": confidence,
            "effort": effort,
            "score": score_value,
        },
    )
    if existing is None:
        rice = RICEScore(
            item_id=item_id,
            reach=reach,
            impact=impact,
            confidence=confidence,
            effort=effort,
            score=score_value,
        )
        db.add(rice)
    else:
        existing.reach = reach
        existing.impact = impact
        existing.confidence = confidence
        existing.effort = effort
        existing.score = score_value
        rice = existing
    _touch_item(db, item_id)
    db.commit()
    db.refresh(rice)
    return rice


def delete_rice_score(db: Session, item_id: UUID) -> None:
    """Idempotent: returns silently if no score exists for the item."""
    existing = db.execute(
        select(RICEScore).where(RICEScore.item_id == item_id)
    ).scalar_one_or_none()
    if existing is None:
        return
    # Record the clear before the actual delete so we capture the old values.
    history_crud.record_score_change(
        db, item_id=item_id, before=existing, after_values=None
    )
    db.delete(existing)
    _touch_item(db, item_id)
    db.commit()


def list_board(db: Session, *, workspace_id: UUID) -> list[BacklogItem]:
    """Workspace items sorted by RICE score DESC (nulls last), then by
    item.created_at ASC. Outer-joined so unscored items still appear."""
    stmt = (
        select(BacklogItem)
        .outerjoin(RICEScore, RICEScore.item_id == BacklogItem.id)
        .where(BacklogItem.workspace_id == workspace_id)
        .options(selectinload(BacklogItem.rice_score))
        .order_by(nulls_last(RICEScore.score.desc()), BacklogItem.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())
