# /apps/api/alembic/versions/0006_add_item_completed_at.py

"""Add `completed_at` to backlog_items.

Revision ID: 0006_add_item_completed_at
Revises: 0005_add_item_scores
Create Date: 2026-05-26 01:00:00.000000

Nullable timestamp - null means "open / not yet shipped", a timestamp
means "completed at this moment". Picking a timestamp over an enum
gives `when did this ship?` for free and keeps the schema minimal.

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_add_item_completed_at"
down_revision: str | None = "0005_add_item_scores"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "backlog_items",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("backlog_items", "completed_at")
