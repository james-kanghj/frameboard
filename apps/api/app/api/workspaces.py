# /apps/api/app/api/workspaces.py

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import (
    CurrentUser,
    require_workspace_member,
    require_workspace_owner,
)
from app.crud import backlog_item as item_crud
from app.crud import workspace as workspace_crud
from app.db.session import get_db
from app.models.workspace import Workspace
from app.schemas.backlog_item import BacklogItemCreate, BacklogItemRead
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate

router = APIRouter(prefix="/workspaces")


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> WorkspaceRead:
    workspace = workspace_crud.create_workspace(
        db,
        name=payload.name,
        owner_id=current_user.id,
        framework=payload.framework,
    )
    return workspace


@router.get("", response_model=list[WorkspaceRead])
def list_workspaces(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[WorkspaceRead]:
    return workspace_crud.list_workspaces(db, user_id=current_user.id)


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(
    workspace: Workspace = Depends(require_workspace_member),
) -> WorkspaceRead:
    # Any member can read workspace metadata.
    return workspace


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
def update_workspace(
    payload: WorkspaceUpdate,
    workspace: Workspace = Depends(require_workspace_owner),
    db: Session = Depends(get_db),
) -> WorkspaceRead:
    fields = payload.model_dump(exclude_unset=True)
    updated = workspace_crud.update_workspace(
        db, workspace_id=workspace.id, **fields
    )
    # require_workspace_owner already 404'd if missing, so updated is non-None.
    assert updated is not None
    return updated


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace: Workspace = Depends(require_workspace_owner),
    db: Session = Depends(get_db),
) -> None:
    workspace_crud.delete_workspace(db, workspace.id)


@router.post(
    "/{workspace_id}/items",
    response_model=BacklogItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_item(
    payload: BacklogItemCreate,
    workspace: Workspace = Depends(require_workspace_member),
    db: Session = Depends(get_db),
) -> BacklogItemRead:
    # Any member can add items - shared workspace = shared backlog.
    return item_crud.create_item(
        db,
        workspace_id=workspace.id,
        title=payload.title,
        description=payload.description,
        tags=payload.tags,
    )


@router.get("/{workspace_id}/items", response_model=list[BacklogItemRead])
def list_items(
    workspace: Workspace = Depends(require_workspace_member),
    db: Session = Depends(get_db),
) -> list[BacklogItemRead]:
    return item_crud.list_items(db, workspace_id=workspace.id)
