# /apps/api/app/api/members.py
#
# Workspace member management: list, invite-by-email, remove. All
# routes are scoped under /v1/workspaces/{id}/members so they share
# the workspace ownership-check pattern used elsewhere.

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.deps import require_workspace_owner
from app.crud import workspace_member as member_crud
from app.db.session import get_db
from app.models.workspace import Workspace

router = APIRouter(prefix="/workspaces")


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    email: str
    display_name: str
    role: str
    created_at: datetime


class MemberInvite(BaseModel):
    email: EmailStr
    role: str = Field(default="scorer", pattern="^(owner|scorer)$")


def _to_read(m) -> MemberRead:  # noqa: ANN001 — ORM row
    return MemberRead(
        id=m.id,
        user_id=m.user_id,
        email=m.user.email,
        display_name=m.user.display_name,
        role=m.role,
        created_at=m.created_at,
    )


@router.get("/{workspace_id}/members", response_model=list[MemberRead])
def list_members(
    workspace: Workspace = Depends(require_workspace_owner),
    db: Session = Depends(get_db),
) -> list[MemberRead]:
    """List every member of the workspace. Owner-only for now — the
    member list doubles as an admin view, and surface contact emails to
    every scorer feels surprising. We can relax later if needed."""
    members = member_crud.list_members(db, workspace_id=workspace.id)
    return [_to_read(m) for m in members]


@router.post(
    "/{workspace_id}/members",
    response_model=MemberRead,
    status_code=status.HTTP_201_CREATED,
)
def invite_member(
    payload: MemberInvite,
    workspace: Workspace = Depends(require_workspace_owner),
    db: Session = Depends(get_db),
) -> MemberRead:
    """Invite a user by email. The User row is created on the fly if
    the email isn't in our system yet — the invitee can later sign in
    via GitHub and the OAuth flow links to the same row by email.

    The current owner can be 're-invited' as a scorer (it's idempotent
    and the existing role wins), but elevating an existing scorer to
    owner is intentionally a no-op too — the primary owner concept is
    stored on workspaces.owner_id, not on members.role."""
    member = member_crud.add_member_by_email(
        db,
        workspace_id=workspace.id,
        email=payload.email,
        role=payload.role,
    )
    # `db.refresh` makes the relationship-loaded user available for the
    # serializer. Without it the response would lack email + name.
    db.refresh(member)
    return _to_read(member)


@router.delete(
    "/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_member(
    user_id: UUID,
    workspace: Workspace = Depends(require_workspace_owner),
    db: Session = Depends(get_db),
) -> None:
    """Removes a member. The primary owner (the workspace's
    `owner_id`) cannot be removed via this route — they have to
    delete the whole workspace if they want to revoke their own
    access, since orphan workspaces aren't supported."""
    if user_id == workspace.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The workspace owner cannot be removed. Delete the "
                "workspace instead, or transfer ownership first."
            ),
        )
    removed = member_crud.remove_member(
        db, workspace_id=workspace.id, user_id=user_id
    )
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        )
