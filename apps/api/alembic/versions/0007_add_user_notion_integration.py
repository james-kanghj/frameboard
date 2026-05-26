# /apps/api/alembic/versions/0007_add_user_notion_integration.py

"""Per-user Notion integration token + target database.

Revision ID: 0007_add_user_notion_integration
Revises: 0006_add_item_completed_at
Create Date: 2026-05-26 02:00:00.000000

Stored on the user row (rather than a separate table) because the
integration is one-per-user and the token is the only fact we care
about - no JSON metadata, no expiry, no multi-account. Both columns
are nullable; null means "not configured yet, refuse to export."

Tokens land in cleartext for the MVP. A production-grade follow-up
would wrap them via KMS or libsodium and store the ciphertext; the
column is plain VARCHAR(255) which is forward-compatible with that
substitution.

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_add_user_notion_integration"
down_revision: str | None = "0006_add_item_completed_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("notion_access_token", sa.String(255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("notion_database_id", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "notion_database_id")
    op.drop_column("users", "notion_access_token")
