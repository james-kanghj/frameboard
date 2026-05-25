# /apps/api/app/api/items.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.crud import backlog_item as item_crud
from app.crud import item_history as history_crud
from app.db.session import get_db
from app.models.backlog_item import BacklogItem
from app.schemas.backlog_item import BacklogItemRead, BacklogItemUpdate
from app.schemas.item_history import ItemHistoryEntry

router = APIRouter(prefix="/items")


def _load_owned_item(
    db: Session, *, item_id: UUID, current_user_id: UUID
) -> BacklogItem:
    """Loads an item and asserts the current user owns the parent
    workspace. 404 (rather than 403) when the item belongs to another
    user — same leak-prevention pattern used by require_workspace_owner."""
    item = item_crud.get_item(db, item_id)
    if item is None or item.workspace.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    return item


@router.patch("/{item_id}", response_model=BacklogItemRead)
def update_item(
    item_id: UUID,
    payload: BacklogItemUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> BacklogItemRead:
    _load_owned_item(db, item_id=item_id, current_user_id=current_user.id)
    fields = payload.model_dump(exclude_unset=True)
    item = item_crud.update_item(db, item_id=item_id, **fields)
    # _load_owned_item guarantees existence; the second update can't 404.
    assert item is not None
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    _load_owned_item(db, item_id=item_id, current_user_id=current_user.id)
    item_crud.delete_item(db, item_id)


@router.get("/{item_id}/history", response_model=list[ItemHistoryEntry])
def get_item_history(
    item_id: UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[ItemHistoryEntry]:
    """Change log for an item, newest first. 404s if the item doesn't
    exist or doesn't belong to the current user."""
    _load_owned_item(db, item_id=item_id, current_user_id=current_user.id)
    return history_crud.list_history(db, item_id=item_id)
