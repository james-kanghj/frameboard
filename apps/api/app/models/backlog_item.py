from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class BacklogItem(Base):
    __tablename__ = "backlog_items"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Free-form labels. Stored as a JSON array so we get the same shape
    # in Postgres (jsonb) and SQLite (TEXT). Application-side normalisation
    # (trim, dedupe, max 10, max 30 chars) lives in the Pydantic schema -
    # validation is enforced at the API boundary, not the column type.
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    # Set when the item is checked off. Null = still open. We keep the
    # full timestamp (not just a boolean) so retrospectives can see
    # "what shipped this quarter" without an extra history lookup.
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="items")  # noqa: F821
    # Plural after the Phase-B per-user split: one RICEScore row per
    # (item, user) pair. The router projects this down to the caller's
    # own row + an aggregate across the workspace; consumers shouldn't
    # touch this relationship directly.
    rice_scores: Mapped[list["RICEScore"]] = relationship(  # noqa: F821
        back_populates="item",
        cascade="all, delete-orphan",
    )
