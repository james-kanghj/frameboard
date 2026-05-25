# /apps/api/app/crud/item_history.py
#
# Helpers that record entries in `item_history`. Callers are expected to
# pass already-diffed payloads — these helpers do the bare minimum of
# "is there anything to record?" filtering so they can sit on any CRUD
# path without producing noisy entries (e.g. a PATCH that re-sends the
# same title shouldn't generate a history row).

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.item_history import ItemHistory
from app.models.rice_score import RICEScore


def _rice_to_dict(rice: RICEScore | None) -> dict[str, Any] | None:
    if rice is None:
        return None
    return {
        "reach": rice.reach,
        "impact": rice.impact,
        "confidence": rice.confidence,
        "effort": rice.effort,
        "score": rice.score,
    }


def record_score_change(
    db: Session,
    *,
    item_id: UUID,
    before: RICEScore | None,
    after_values: dict[str, Any] | None,
) -> None:
    """Records a "score" history row. `after_values` is None when the
    score is cleared (delete). When before is None the row represents
    the first-ever scoring of this item.

    If `before` and `after_values` are equivalent (all numeric fields
    match), no row is written — common case is a PATCH that re-saves the
    same values."""
    before_dict = _rice_to_dict(before)
    if before_dict is not None and after_values is not None:
        # Drop the derived `score` from the comparison so a callsite that
        # passes only the four inputs still matches.
        keys = ("reach", "impact", "confidence", "effort")
        if all(before_dict.get(k) == after_values.get(k) for k in keys):
            return
    db.add(
        ItemHistory(
            item_id=item_id,
            kind="score",
            before=before_dict,
            after=after_values,
        )
    )


def record_fields_change(
    db: Session,
    *,
    item_id: UUID,
    before: dict[str, Any],
    after: dict[str, Any],
) -> None:
    """Records a "fields" history row containing ONLY the keys whose value
    changed between `before` and `after`. If nothing changed, no row is
    written. Lists (e.g. tags) compare by equality, so reordering counts
    as a change — that's intentional, callers that don't want order to
    matter should normalise upstream."""
    diff_keys = [k for k in after if before.get(k) != after.get(k)]
    if not diff_keys:
        return
    db.add(
        ItemHistory(
            item_id=item_id,
            kind="fields",
            before={k: before.get(k) for k in diff_keys},
            after={k: after.get(k) for k in diff_keys},
        )
    )


def list_history(
    db: Session, *, item_id: UUID, limit: int = 100
) -> list[ItemHistory]:
    stmt = (
        select(ItemHistory)
        .where(ItemHistory.item_id == item_id)
        .order_by(desc(ItemHistory.changed_at), desc(ItemHistory.id))
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())
