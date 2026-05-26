# /apps/api/app/api/test_utils.py

"""Test-only endpoints. The router is conditionally registered in main.py
only when FRAMEBOARD_TEST_MODE=1 - in production it is not mounted at all,
so these routes return 404. Defensive against accidental data loss."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.crud import workspace as workspace_crud
from app.db.session import get_db
from app.models.workspace import Workspace

router = APIRouter(prefix="/_test")


# Plain `str` (not EmailStr) so e2e test emails on RFC-2606 reserved TLDs
# like `.test` are accepted. Strict validation lives on the real endpoints.
class ResetRequest(BaseModel):
    owner_email: str = Field(..., min_length=3)


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_data(
    payload: ResetRequest,
    db: Session = Depends(get_db),
) -> None:
    """Wipe all workspaces (cascade-deleting items + rice_scores) belonging
    to the given owner_email, then ensure the user row itself exists so the
    next API call doesn't need to re-create it. Used by e2e tests to start
    each scenario from a known empty state."""
    user = workspace_crud.get_or_create_user(db, payload.owner_email)
    db.execute(delete(Workspace).where(Workspace.owner_id == user.id))
    db.commit()
