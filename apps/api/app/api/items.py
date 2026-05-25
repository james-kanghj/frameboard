# /apps/api/app/api/items.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.crud import backlog_item as item_crud
from app.db.session import get_db
from app.schemas.backlog_item import BacklogItemRead, BacklogItemUpdate

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
