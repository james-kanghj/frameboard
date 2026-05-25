# /apps/api/app/api/items.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud import backlog_item as item_crud
from app.crud import item_history as history_crud
from app.db.session import get_db
from app.schemas.backlog_item import BacklogItemRead, BacklogItemUpdate
from app.schemas.item_history import ItemHistoryEntry

router = APIRouter(prefix="/items")


@router.patch("/{item_id}", response_model=BacklogItemRead)
def update_item(
    item_id: UUID,
    payload: BacklogItemUpdate,
    db: Session = Depends(get_db),
) -> BacklogItemRead:
    fields = payload.model_dump(exclude_unset=True)
    item = item_crud.update_item(db, item_id=item_id, **fields)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: UUID, db: Session = Depends(get_db)) -> None:
    deleted = item_crud.delete_item(db, item_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )


@router.get("/{item_id}/history", response_model=list[ItemHistoryEntry])
def get_item_history(
    item_id: UUID, db: Session = Depends(get_db)
) -> list[ItemHistoryEntry]:
    """Change log for an item, newest first. 404s if the item itself
    doesn't exist so the frontend can distinguish 'no changes yet' (200
    with empty list) from 'wrong id'."""
    if item_crud.get_item(db, item_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Item not found"
        )
    return history_crud.list_history(db, item_id=item_id)
