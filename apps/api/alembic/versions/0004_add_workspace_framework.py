# /apps/api/alembic/versions/0004_add_workspace_framework.py

"""Add `framework` column to workspaces (default RICE).

Revision ID: 0004_add_workspace_framework
Revises: 0003_add_item_history
Create Date: 2026-05-25 23:55:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_add_workspace_framework"
down_revision: str | None = "0003_add_item_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Plain VARCHAR (not Postgres ENUM) for the same reason as
    # item_history.kind — the framework set is expected to grow and
    # ALTERing a Postgres enum across deploys is more friction than
    # validating in Python is worth saving.
    op.add_column(
        "workspaces",
        sa.Column(
            "framework",
            sa.String(20),
            nullable=False,
            server_default="RICE",
        ),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "framework")
