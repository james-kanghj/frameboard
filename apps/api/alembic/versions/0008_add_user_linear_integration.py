# /apps/api/alembic/versions/0008_add_user_linear_integration.py

"""Per-user Linear integration API key + target team.

Revision ID: 0008_add_user_linear_integration
Revises: 0007_add_user_notion_integration
Create Date: 2026-05-26 03:00:00.000000

Same shape as the Notion columns added in 0007 — one row per user,
nullable until the user configures the integration. Linear's personal
API key is short-form (`lin_api_*`), and the team id is a UUID, so the
column widths track those formats with a small buffer.

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_add_user_linear_integration"
down_revision: str | None = "0007_add_user_notion_integration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("linear_api_key", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("linear_team_id", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "linear_team_id")
    op.drop_column("users", "linear_api_key")
