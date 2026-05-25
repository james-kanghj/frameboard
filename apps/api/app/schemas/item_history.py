# /apps/api/app/schemas/item_history.py

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ItemHistoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    item_id: UUID
    changed_at: datetime
    kind: str  # "score" | "fields"
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
