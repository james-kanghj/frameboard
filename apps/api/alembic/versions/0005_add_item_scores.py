# /apps/api/alembic/versions/0005_add_item_scores.py

"""Add `item_scores` table - polymorphic store for ICE/MoSCoW/ValueEffort.

Revision ID: 0005_add_item_scores
Revises: 0004_add_workspace_framework
Create Date: 2026-05-26 00:30:00.000000

The existing `rice_scores` table is left in place: RICE is the most-used
framework and the rest of the codebase already reads from it. The new
table is purely additive - non-RICE frameworks write here. A follow-up
migration can backfill RICE into `item_scores` and drop the legacy table
once the read-paths are unified.

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from alembic import op

revision: str = "0005_add_item_scores"
down_revision: str | None = "0004_add_workspace_framework"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item_scores",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "item_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("backlog_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("framework", sa.String(20), nullable=False),
        # JSON for cross-dialect compatibility (jsonb on Postgres, TEXT on
        # SQLite); Pydantic enforces the per-framework input shape upstream.
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, index=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        # One score per (item, framework) - re-scoring upserts in place.
        sa.UniqueConstraint("item_id", "framework", name="uq_item_scores_item_framework"),
    )
    op.create_index(
        "ix_item_scores_item_framework",
        "item_scores",
        ["item_id", "framework"],
    )


def downgrade() -> None:
    op.drop_index("ix_item_scores_item_framework", table_name="item_scores")
    op.drop_table("item_scores")
