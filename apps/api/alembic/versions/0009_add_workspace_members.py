# /apps/api/alembic/versions/0009_add_workspace_members.py

"""Workspace membership table + backfill from owner_id.

Revision ID: 0009_add_workspace_members
Revises: 0008_add_user_linear_integration
Create Date: 2026-05-26 04:00:00.000000

Sets up the table the collaborative-scoring arc reads from. Existing
workspaces get a member row for their current `owner_id` with role
"owner" so behaviour is byte-identical until the new invite endpoint
adds more members.

Workspace.owner_id stays on the table — it's still the denormalised
"primary owner" pointer used by every existing ownership check and by
the cascade rules. The members table is purely additive for now;
non-owner members get role = "scorer".

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from alembic import op

revision: str = "0009_add_workspace_members"
down_revision: str | None = "0008_add_user_linear_integration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_members",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        # "owner" — full destructive perms (rename, delete workspace,
        # manage members). "scorer" — can read, score, edit, complete
        # items but can't change workspace metadata.
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "workspace_id", "user_id", name="uq_workspace_members_pair"
        ),
    )

    # Backfill: every workspace's owner becomes a member with role "owner".
    # gen_random_uuid() comes from pgcrypto in modern Postgres; the
    # initial migration enabled the extension we need, but to be
    # defensive we go through `sa.text()` so the cast happens at SQL
    # level. SQLite (used in tests) won't run this branch — tests start
    # from create_all and tests' setup adds members via the CRUD path.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
                SELECT gen_random_uuid(), id, owner_id, 'owner', now()
                FROM workspaces
                WHERE NOT EXISTS (
                    SELECT 1 FROM workspace_members m
                    WHERE m.workspace_id = workspaces.id
                      AND m.user_id = workspaces.owner_id
                )
                """
            )
        )


def downgrade() -> None:
    op.drop_table("workspace_members")
