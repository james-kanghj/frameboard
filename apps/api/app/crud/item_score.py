# /apps/api/app/crud/item_score.py

from __future__ import annotations

from collections.abc import Iterable
from statistics import pvariance
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.backlog_item import BacklogItem
from app.models.item_score import ItemScore


def _touch_item(db: Session, item_id: UUID) -> None:
    db.execute(
        update(BacklogItem)
        .where(BacklogItem.id == item_id)
        .values(updated_at=func.now())
    )


def get_score(
    db: Session, *, item_id: UUID, framework: str, user_id: UUID
) -> ItemScore | None:
    return db.execute(
        select(ItemScore).where(
            ItemScore.item_id == item_id,
            ItemScore.framework == framework,
            ItemScore.user_id == user_id,
        )
    ).scalar_one_or_none()


def upsert_score(
    db: Session,
    *,
    item_id: UUID,
    user_id: UUID,
    framework: str,
    inputs: dict[str, Any],
    score: float,
) -> ItemScore:
    """Per-user, per-framework upsert. Unique on (item_id, framework,
    user_id) — each member can keep an independent score per
    framework on the same item."""
    existing = get_score(
        db, item_id=item_id, framework=framework, user_id=user_id
    )
    if existing is None:
        row = ItemScore(
            item_id=item_id,
            user_id=user_id,
            framework=framework,
            inputs=inputs,
            score=score,
        )
        db.add(row)
    else:
        existing.inputs = inputs
        existing.score = score
        row = existing
    _touch_item(db, item_id)
    db.commit()
    db.refresh(row)
    return row


def delete_score(
    db: Session, *, item_id: UUID, framework: str, user_id: UUID
) -> bool:
    """Removes only the caller's row for this (item, framework)
    pair. Other members' rows survive."""
    existing = get_score(
        db, item_id=item_id, framework=framework, user_id=user_id
    )
    if existing is None:
        return False
    db.delete(existing)
    _touch_item(db, item_id)
    db.commit()
    return True


def list_my_scores_for_workspace(
    db: Session, *, workspace_id: UUID, framework: str, user_id: UUID
) -> dict[UUID, ItemScore]:
    """`{item_id: my_score}` for the caller, filtered to one framework."""
    stmt = (
        select(ItemScore)
        .join(BacklogItem, ItemScore.item_id == BacklogItem.id)
        .where(
            BacklogItem.workspace_id == workspace_id,
            ItemScore.framework == framework,
            ItemScore.user_id == user_id,
        )
    )
    return {row.item_id: row for row in db.execute(stmt).scalars().all()}


def list_all_scores_for_workspace(
    db: Session, *, workspace_id: UUID, framework: str
) -> dict[UUID, list[ItemScore]]:
    """`{item_id: [per_user_score, ...]}` for aggregate computation."""
    stmt = (
        select(ItemScore)
        .join(BacklogItem, ItemScore.item_id == BacklogItem.id)
        .where(
            BacklogItem.workspace_id == workspace_id,
            ItemScore.framework == framework,
        )
    )
    out: dict[UUID, list[ItemScore]] = {}
    for row in db.execute(stmt).scalars().all():
        out.setdefault(row.item_id, []).append(row)
    return out


def aggregate(scores: Iterable[ItemScore]) -> dict | None:
    """Mean + variance + contributor count, mirroring the RICE
    aggregate. Returns None when no rows."""
    rows = list(scores)
    if not rows:
        return None
    values = [r.score for r in rows]
    mean = sum(values) / len(values)
    return {
        "score": round(mean, 2),
        "contributor_count": len(rows),
        "variance": round(pvariance(values), 2) if len(values) > 1 else 0.0,
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }
