# /apps/api/alembic/versions/0010_per_user_scores.py

"""Per-user score rows for rice_scores + item_scores.

Revision ID: 0010_per_user_scores
Revises: 0009_add_workspace_members
Create Date: 2026-05-26 05:00:00.000000

The Phase B change for collaborative scoring: every workspace member
keeps their own row. We add user_id to both score tables, backfill
existing rows with the workspace's primary owner, then swap the unique
constraint from `(item_id,…)` to `(item_id, user_id,…)` so multiple
users can score the same item without collisions.

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from alembic import op

revision: str = "0010_per_user_scores"
down_revision: str | None = "0009_add_workspace_members"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # ── rice_scores ────────────────────────────────────────────────
    op.add_column(
        "rice_scores",
        sa.Column(
            "user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    if is_pg:
        op.execute(
            sa.text(
                """
                UPDATE rice_scores AS rs
                SET user_id = ws.owner_id
                FROM backlog_items bi
                JOIN workspaces ws ON ws.id = bi.workspace_id
                WHERE bi.id = rs.item_id AND rs.user_id IS NULL
                """
            )
        )
    op.alter_column("rice_scores", "user_id", nullable=False)
    op.drop_constraint("rice_scores_item_id_key", "rice_scores", type_="unique")
    op.create_unique_constraint(
        "uq_rice_scores_item_user",
        "rice_scores",
        ["item_id", "user_id"],
    )

    # ── item_scores ────────────────────────────────────────────────
    op.add_column(
        "item_scores",
        sa.Column(
            "user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    if is_pg:
        op.execute(
            sa.text(
                """
                UPDATE item_scores AS ins
                SET user_id = ws.owner_id
                FROM backlog_items bi
                JOIN workspaces ws ON ws.id = bi.workspace_id
                WHERE bi.id = ins.item_id AND ins.user_id IS NULL
                """
            )
        )
    op.alter_column("item_scores", "user_id", nullable=False)
    op.drop_constraint(
        "uq_item_scores_item_framework", "item_scores", type_="unique"
    )
    op.create_unique_constraint(
        "uq_item_scores_item_framework_user",
        "item_scores",
        ["item_id", "framework", "user_id"],
    )


def downgrade() -> None:
    # rice_scores
    op.drop_constraint(
        "uq_rice_scores_item_user", "rice_scores", type_="unique"
    )
    op.create_unique_constraint(
        "rice_scores_item_id_key", "rice_scores", ["item_id"]
    )
    op.drop_column("rice_scores", "user_id")

    # item_scores
    op.drop_constraint(
        "uq_item_scores_item_framework_user", "item_scores", type_="unique"
    )
    op.create_unique_constraint(
        "uq_item_scores_item_framework",
        "item_scores",
        ["item_id", "framework"],
    )
    op.drop_column("item_scores", "user_id")
