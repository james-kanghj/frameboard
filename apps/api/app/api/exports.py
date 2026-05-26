# /apps/api/app/api/exports.py
#
# Workspace → external-service export endpoints. Each integration runs
# server-side (so we don't have to hand the user's third-party token to
# the browser) and returns a small summary the frontend can render as
# "12 created, 1 failed".

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, require_workspace_member
from app.crud import backlog_item as item_crud
from app.db.session import get_db
from app.models.workspace import Workspace
from app.services.linear_export import LinearExportError, create_issue
from app.services.notion_export import NotionExportError, create_page

router = APIRouter(prefix="/workspaces")


class ExportFailure(BaseModel):
    title: str
    error: str


class ExportResult(BaseModel):
    created: int
    failed: int
    failures: list[ExportFailure]


@router.post(
    "/{workspace_id}/export/notion", response_model=ExportResult
)
def export_to_notion(
    current_user: CurrentUser,
    workspace: Workspace = Depends(require_workspace_member),
    db: Session = Depends(get_db),
) -> ExportResult:
    """Push every item in the workspace into the caller's Notion
    database as a new page. Failures don't abort the run — each row's
    error is collected and returned alongside the success count so a
    misconfigured database doesn't sink the whole export."""
    token = current_user.notion_access_token
    database_id = current_user.notion_database_id
    if not token or not database_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Notion integration is not configured. Set "
                "`notion_access_token` and `notion_database_id` via "
                "PATCH /v1/users/me first."
            ),
        )

    items = item_crud.list_items(db, workspace_id=workspace.id)
    created = 0
    failures: list[ExportFailure] = []
    for item in items:
        try:
            create_page(
                token=token,
                database_id=database_id,
                title=item.title,
                description=item.description,
            )
            created += 1
        except NotionExportError as e:
            failures.append(ExportFailure(title=item.title, error=str(e)))

    return ExportResult(
        created=created, failed=len(failures), failures=failures
    )


@router.post(
    "/{workspace_id}/export/linear", response_model=ExportResult
)
def export_to_linear(
    current_user: CurrentUser,
    workspace: Workspace = Depends(require_workspace_member),
    db: Session = Depends(get_db),
) -> ExportResult:
    """Push every workspace item into Linear as a new issue under the
    caller's configured team. Same partial-failure shape as the Notion
    export — a per-row error doesn't abort the run."""
    api_key = current_user.linear_api_key
    team_id = current_user.linear_team_id
    if not api_key or not team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Linear integration is not configured. Set "
                "`linear_api_key` and `linear_team_id` via "
                "PATCH /v1/users/me first."
            ),
        )

    items = item_crud.list_items(db, workspace_id=workspace.id)
    created = 0
    failures: list[ExportFailure] = []
    for item in items:
        try:
            create_issue(
                api_key=api_key,
                team_id=team_id,
                title=item.title,
                description=item.description,
            )
            created += 1
        except LinearExportError as e:
            failures.append(ExportFailure(title=item.title, error=str(e)))

    return ExportResult(
        created=created, failed=len(failures), failures=failures
    )
