# /apps/api/app/crud/rice_score.py

from __future__ import annotations

from uuid import UUID

from sqlalchemy import nulls_last, select
from sqlalchemy.orm import Session, selectinload

from app.models.backlog_item import BacklogItem
from app.models.rice_score import RICEScore


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
    db.delete(existing)
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
