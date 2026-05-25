# /apps/api/app/models/item_history.py

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ItemHistory(Base):
    """Append-only change log per backlog item. Rows are written by the
    score/field CRUD paths whenever a value changes; nothing else mutates
    this table (no UPDATE/DELETE outside of cascade from item delete)."""

    __tablename__ = "item_history"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    item_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("backlog_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Python-side default with microsecond precision: SQLite's CURRENT_TIMESTAMP
    # is second-precision, which collides when multiple history rows are
    # written within the same second (real: rapid PATCH; tests: every test).
    # Postgres' NOW() is microsecond-precise, so a Python default is just
    # as good there.
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    # "score" — RICE values changed (before/after carry reach/impact/...).
    # "fields" — item title/description/tags changed (only changed keys are
    # included in before/after).
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
