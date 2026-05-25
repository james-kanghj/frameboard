# /apps/api/alembic/versions/0003_add_item_history.py

"""Add item_history table for score and field change-log timeline.

Revision ID: 0003_add_item_history
Revises: 0002_add_item_tags
Create Date: 2026-05-25 23:30:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from alembic import op

revision: str = "0003_add_item_history"
down_revision: str | None = "0002_add_item_tags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `kind` is a free-string column rather than a Postgres ENUM because the
    # set of recorded events is expected to grow (e.g. tags-changed split out
    # later) and ALTERing a Postgres enum is more friction than it's worth
    # for an append-only log. JSON `before`/`after` are nullable: `before` is
    # NULL on the first scoring, `after` is NULL when a score is cleared.
    op.create_table(
        "item_history",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "item_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("backlog_items.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
    )
    # Covering index for the common access pattern: newest-first per item.
    op.create_index(
        "ix_item_history_item_changed",
        "item_history",
        ["item_id", sa.text("changed_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_item_history_item_changed", table_name="item_history")
    op.drop_table("item_history")
