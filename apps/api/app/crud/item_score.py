# /apps/api/app/crud/item_score.py
#
# Polymorphic per-framework score CRUD. Sits next to (not on top of) the
# legacy `rice_score` CRUD — RICE writes can land in either store; the
# board endpoint and history hooks decide which to read from based on
# the workspace.framework.

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.backlog_item import BacklogItem
from app.models.item_score import ItemScore


def _touch_item(db: Session, item_id: UUID) -> None:
    """Mirror of rice_score._touch_item — keeps the parent item's
    updated_at in sync with scoring activity. Duplicated rather than
    extracted because both stores will eventually unify and the helper
    can move with the survivor."""
    db.execute(
        update(BacklogItem)
        .where(BacklogItem.id == item_id)
        .values(updated_at=func.now())
    )


def get_score(
    db: Session, *, item_id: UUID, framework: str
) -> ItemScore | None:
    return db.execute(
        select(ItemScore).where(
            ItemScore.item_id == item_id,
            ItemScore.framework == framework,
        )
    ).scalar_one_or_none()


def upsert_score(
    db: Session,
    *,
    item_id: UUID,
    framework: str,
    inputs: dict[str, Any],
    score: float,
) -> ItemScore:
    existing = get_score(db, item_id=item_id, framework=framework)
    if existing is None:
        row = ItemScore(
            item_id=item_id,
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


def delete_score(db: Session, *, item_id: UUID, framework: str) -> bool:
    existing = get_score(db, item_id=item_id, framework=framework)
    if existing is None:
        return False
    db.delete(existing)
    _touch_item(db, item_id)
    db.commit()
    return True


def list_scores_for_workspace(
    db: Session, *, workspace_id: UUID, framework: str
) -> dict[UUID, ItemScore]:
    """Returns {item_id: ItemScore} for every scored item in the workspace
    under the given framework. The board endpoint joins this against the
    items list to render the correct active score per row."""
    stmt = (
        select(ItemScore)
        .join(BacklogItem, ItemScore.item_id == BacklogItem.id)
        .where(
            BacklogItem.workspace_id == workspace_id,
            ItemScore.framework == framework,
        )
    )
    return {row.item_id: row for row in db.execute(stmt).scalars().all()}
