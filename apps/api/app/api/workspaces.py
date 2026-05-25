# /apps/api/app/api/workspaces.py

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.crud import backlog_item as item_crud
from app.crud import workspace as workspace_crud
from app.db.session import get_db
from app.schemas.backlog_item import BacklogItemCreate, BacklogItemRead
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead

router = APIRouter(prefix="/workspaces")


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    db: Session = Depends(get_db),
) -> WorkspaceRead:
    workspace = workspace_crud.create_workspace(
        db, name=payload.name, owner_email=payload.owner_email
    )
    return workspace


@router.get("", response_model=list[WorkspaceRead])
def list_workspaces(
    owner_email: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[WorkspaceRead]:
    return workspace_crud.list_workspaces(db, owner_email=owner_email)


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(workspace_id: UUID, db: Session = Depends(get_db)) -> WorkspaceRead:
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    return workspace


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(workspace_id: UUID, db: Session = Depends(get_db)) -> None:
    deleted = workspace_crud.delete_workspace(db, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )


@router.post(
    "/{workspace_id}/items",
    response_model=BacklogItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_item(
    workspace_id: UUID,
    payload: BacklogItemCreate,
    db: Session = Depends(get_db),
) -> BacklogItemRead:
    if workspace_crud.get_workspace(db, workspace_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    return item_crud.create_item(
        db,
        workspace_id=workspace_id,
        title=payload.title,
        description=payload.description,
    )


@router.get("/{workspace_id}/items", response_model=list[BacklogItemRead])
def list_items(
    workspace_id: UUID,
    db: Session = Depends(get_db),
) -> list[BacklogItemRead]:
    if workspace_crud.get_workspace(db, workspace_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    return item_crud.list_items(db, workspace_id=workspace_id)
