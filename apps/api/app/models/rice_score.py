/apps/api/app/models/rice_score.py

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RICEScore(Base):
    __tablename__ = "rice_scores"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    item_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("backlog_items.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    reach: Mapped[float] = mapped_column(Float, nullable=False)
    impact: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    effort: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, index=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    item: Mapped["BacklogItem"] = relationship(back_populates="rice_score")  # noqa: F821

    @staticmethod
    def compute(reach: float, impact: float, confidence: float, effort: float) -> float:
        if effort <= 0:
            raise ValueError("effort must be greater than 0")
        return round((reach * impact * confidence) / effort, 2)
