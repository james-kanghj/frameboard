# /apps/api/app/crud/workspace_member.py

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.crud import workspace as workspace_crud
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember

OWNER = "owner"
SCORER = "scorer"
VALID_ROLES = (OWNER, SCORER)


def get_membership(
    db: Session, *, workspace_id: UUID, user_id: UUID
) -> WorkspaceMember | None:
    return db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    ).scalar_one_or_none()


def list_members(
    db: Session, *, workspace_id: UUID
) -> list[WorkspaceMember]:
    """All members for a workspace, eagerly loading user rows so the
    response can render display name + email without a separate query
    per member."""
    stmt = (
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user))
        .order_by(WorkspaceMember.created_at.asc())
    )
    return list(db.execute(stmt).scalars().all())


def list_workspaces_for_user(
    db: Session, *, user_id: UUID
) -> list[Workspace]:
    """Workspaces the user has any membership in - owner or scorer.
    Replaces the old "filter by owner_id" path so invited members see
    the workspace in their list."""
    stmt = (
        select(Workspace)
        .join(
            WorkspaceMember,
            WorkspaceMember.workspace_id == Workspace.id,
        )
        .where(WorkspaceMember.user_id == user_id)
        .order_by(Workspace.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def add_member_by_email(
    db: Session, *, workspace_id: UUID, email: str, role: str = SCORER
) -> WorkspaceMember:
    """Look up the user (creating one on the fly if the email is new)
    and add them to the workspace. Returns the existing membership
    row if one already exists for this user - the call is idempotent
    so a double-click on Invite doesn't 500."""
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {VALID_ROLES}, got {role!r}")
    user = workspace_crud.get_or_create_user(db, email)
    db.flush()
    existing = get_membership(db, workspace_id=workspace_id, user_id=user.id)
    if existing is not None:
        return existing
    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=user.id,
        role=role,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def remove_member(
    db: Session, *, workspace_id: UUID, user_id: UUID
) -> bool:
    """Removes the membership row. The primary owner can't be removed
    - the caller is expected to enforce that before invoking. Returns
    True if a row was removed, False if it didn't exist."""
    member = get_membership(
        db, workspace_id=workspace_id, user_id=user_id
    )
    if member is None:
        return False
    db.delete(member)
    db.commit()
    return True


def ensure_owner_member(
    db: Session, *, workspace_id: UUID, owner_user_id: UUID
) -> WorkspaceMember:
    """Idempotent: makes sure the workspace's primary owner has a
    matching members row. Called from create_workspace and from tests
    so an in-memory SQLite test DB (which doesn't run the Postgres
    backfill in migration 0009) still has consistent membership."""
    existing = get_membership(
        db, workspace_id=workspace_id, user_id=owner_user_id
    )
    if existing is not None:
        return existing
    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=owner_user_id,
        role=OWNER,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member
