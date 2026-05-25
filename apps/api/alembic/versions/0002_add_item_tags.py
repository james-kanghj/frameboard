# /apps/api/alembic/versions/0002_add_item_tags.py

"""Add `tags` JSON column to backlog_items.

Revision ID: 0002_add_item_tags
Revises: 0001_initial_schema
Create Date: 2026-05-25 22:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_add_item_tags"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add nullable first so existing rows aren't rejected. JSON is the
    # cross-dialect choice (jsonb on Postgres, TEXT on SQLite).
    op.add_column(
        "backlog_items",
        sa.Column("tags", sa.JSON(), nullable=True),
    )
    # Backfill existing rows with an empty array so the NOT NULL
    # constraint succeeds.
    op.execute("UPDATE backlog_items SET tags = '[]'")
    op.alter_column("backlog_items", "tags", nullable=False)


def downgrade() -> None:
    op.drop_column("backlog_items", "tags")
