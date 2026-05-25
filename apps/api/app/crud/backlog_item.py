# /apps/api/app/crud/backlog_item.py

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.backlog_item import BacklogItem


def create_item(
    db: Session,
    *,
    workspace_id: UUID,
    title: str,
    description: str | None,
) -> BacklogItem:
    item = BacklogItem(workspace_id=workspace_id, title=title, description=description)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_items(db: Session, *, workspace_id: UUID) -> list[BacklogItem]:
    stmt = (
        select(BacklogItem)
        .where(BacklogItem.workspace_id == workspace_id)
        .options(selectinload(BacklogItem.rice_score))
        .order_by(BacklogItem.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_item(db: Session, item_id: UUID) -> BacklogItem | None:
    stmt = (
        select(BacklogItem)
        .where(BacklogItem.id == item_id)
        .options(selectinload(BacklogItem.rice_score))
    )
    return db.execute(stmt).scalar_one_or_none()


def update_item(db: Session, *, item_id: UUID, **fields: Any) -> BacklogItem | None:
    """Partial update. Caller is expected to pass only fields that should be
    written (e.g. via Pydantic `model_dump(exclude_unset=True)`), so PATCH
    with an omitted field leaves the column untouched but PATCH with an
    explicit `null` clears it."""
    item = db.get(BacklogItem, item_id)
    if item is None:
        return None
    for key, value in fields.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item_id: UUID) -> bool:
    item = db.get(BacklogItem, item_id)
    if item is None:
        return False
    db.delete(item)
    db.commit()
    return True
