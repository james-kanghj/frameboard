# /apps/api/app/crud/workspace.py

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.workspace import Workspace


def get_or_create_user(db: Session, email: str) -> User:
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing is not None:
        return existing
    user = User(email=email, display_name=email.split("@", 1)[0])
    db.add(user)
    db.flush()
    return user


def create_workspace(
    db: Session,
    *,
    name: str,
    owner_id: UUID,
    framework: str = "RICE",
) -> Workspace:
    workspace = Workspace(name=name, owner_id=owner_id, framework=framework)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def update_workspace(
    db: Session,
    *,
    workspace_id: UUID,
    name: str | None = None,
    framework: str | None = None,
) -> Workspace | None:
    """Partial update — None fields are left alone. Returns None if the
    workspace doesn't exist so the router can 404."""
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        return None
    if name is not None:
        workspace.name = name
    if framework is not None:
        workspace.framework = framework
    db.commit()
    db.refresh(workspace)
    return workspace


def list_workspaces(db: Session, *, owner_id: UUID) -> list[Workspace]:
    stmt = (
        select(Workspace)
        .where(Workspace.owner_id == owner_id)
        .order_by(Workspace.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def get_workspace(db: Session, workspace_id: UUID) -> Workspace | None:
    # No selectinload(items) — the detail endpoint returns just metadata
    # (matching WorkspaceRead). Callers needing items use /board, which has
    # its own optimized query with the right ordering.
    return db.get(Workspace, workspace_id)


def delete_workspace(db: Session, workspace_id: UUID) -> bool:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        return False
    db.delete(workspace)
    db.commit()
    return True
