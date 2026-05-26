# /apps/api/app/crud/backlog_item.py

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crud import item_history as history_crud
from app.models.backlog_item import BacklogItem


def create_item(
    db: Session,
    *,
    workspace_id: UUID,
    title: str,
    description: str | None,
    tags: list[str] | None = None,
) -> BacklogItem:
    item = BacklogItem(
        workspace_id=workspace_id,
        title=title,
        description=description,
        tags=tags or [],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def list_items(db: Session, *, workspace_id: UUID) -> list[BacklogItem]:
    stmt = (
        select(BacklogItem)
        .where(BacklogItem.workspace_id == workspace_id)
        .options(selectinload(BacklogItem.rice_scores))
        .order_by(BacklogItem.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_item(db: Session, item_id: UUID) -> BacklogItem | None:
    stmt = (
        select(BacklogItem)
        .where(BacklogItem.id == item_id)
        .options(selectinload(BacklogItem.rice_scores))
    )
    return db.execute(stmt).scalar_one_or_none()


def update_item(db: Session, *, item_id: UUID, **fields: Any) -> BacklogItem | None:
    """Partial update. Caller is expected to pass only fields that should be
    written (e.g. via Pydantic `model_dump(exclude_unset=True)`), so PATCH
    with an omitted field leaves the column untouched but PATCH with an
    explicit `null` clears it.

    `tags` is NOT NULL in the DB but `None` from the schema means
    "leave alone" (the schema uses None as the sentinel for omitted).
    Empty list `[]` is the explicit way to clear all tags."""
    item = db.get(BacklogItem, item_id)
    if item is None:
        return None
    if "tags" in fields and fields["tags"] is None:
        del fields["tags"]
    # Snapshot only the keys the caller is touching, so the history diff
    # records the smallest meaningful delta. Lists (tags) are copied so a
    # later in-place mutation doesn't poison the before-image.
    before = {k: _snapshot(getattr(item, k)) for k in fields}
    for key, value in fields.items():
        setattr(item, key, value)
    after = {k: _snapshot(getattr(item, k)) for k in fields}
    history_crud.record_fields_change(
        db, item_id=item_id, before=before, after=after
    )
    db.commit()
    db.refresh(item)
    return item


def _snapshot(value: Any) -> Any:
    """Shallow copy lists (tags) so the before-image stays stable after
    the setattr loop. Scalars pass through unchanged."""
    if isinstance(value, list):
        return list(value)
    return value


def delete_item(db: Session, item_id: UUID) -> bool:
    item = db.get(BacklogItem, item_id)
    if item is None:
        return False
    db.delete(item)
    db.commit()
    return True
