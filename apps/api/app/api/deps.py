# /apps/api/app/api/deps.py
#
# Request-scoped authentication dependency. Two modes:
#
# 1. Production / auth-enabled: verify the `Authorization: Bearer <jwt>`
#    header against NEXTAUTH_SECRET (HS256). NextAuth on the frontend
#    signs the session JWT with the same secret and exposes it to the
#    browser via a custom session callback so the API client can attach
#    it on every request.
#
# 2. Self-host / development (AUTH_DISABLED=1): skip JWT verification
#    and treat every request as `dev_user_email`. Optionally honour a
#    `X-Dev-User: <email>` header so contributors and tests can simulate
#    multiple identities without setting up an OAuth app.

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.crud import workspace as workspace_crud
from app.db.session import get_db
from app.models.user import User


def _user_from_email(db: Session, email: str) -> User:
    """get-or-create - first request for a given email materialises the
    User row. Display name defaults to the local part of the email; the
    OAuth flow can update it later if a name is provided."""
    return workspace_crud.get_or_create_user(db, email)


def _decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.nextauth_secret,
            algorithms=["HS256"],
            # NextAuth doesn't set an `aud` by default; skip the check
            # rather than match a moving target across providers.
            options={"verify_aud": False},
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid session token: {e}",
        ) from e


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    x_dev_user: Annotated[str | None, Header()] = None,
) -> User:
    if settings.auth_is_disabled:
        # Self-host / dev: pick the X-Dev-User override if present, else
        # the configured default. We commit (via _user_from_email) so
        # downstream selectors see a stable user id across requests.
        email = (x_dev_user or settings.dev_user_email).strip().lower()
        if not email:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="dev_user_email is not configured",
            )
        user = _user_from_email(db, email)
        db.commit()
        return user

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_jwt(token)
    email = payload.get("email")
    if not isinstance(email, str) or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token missing `email` claim",
        )
    user = _user_from_email(db, email.lower())
    # Update the display name if the token carries one and the row was
    # created with the email-local-part default.
    name = payload.get("name")
    if isinstance(name, str) and name and (
        user.display_name == email.split("@", 1)[0] or not user.display_name
    ):
        user.display_name = name
    db.commit()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_workspace_owner(
    workspace_id: UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Loads the workspace and asserts the current user owns it. Returns
    the workspace so handlers can reuse it. 404 (not 403) when the user
    doesn't own the workspace - leaks no information about whether the
    workspace exists at all."""
    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None or workspace.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    return workspace


def require_workspace_member(
    workspace_id: UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Looser variant: any member (owner OR scorer) passes. Used by
    read/score/edit paths so invited collaborators can interact with the
    workspace; destructive operations (delete workspace, manage members)
    still go through `require_workspace_owner`."""
    # Local import dodges a circular reference between
    # app.api.deps and app.crud.workspace_member.
    from app.crud import workspace_member as member_crud

    workspace = workspace_crud.get_workspace(db, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    # Owner-id short-circuit so the common single-user path doesn't
    # incur an extra SELECT.
    if workspace.owner_id == current_user.id:
        return workspace
    membership = member_crud.get_membership(
        db, workspace_id=workspace_id, user_id=current_user.id
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )
    return workspace
