# /apps/api/app/crud/rice_score.py

from __future__ import annotations

from collections.abc import Iterable
from statistics import pvariance
from uuid import UUID

from sqlalchemy import func, nulls_last, select, update
from sqlalchemy.orm import Session, selectinload

from app.crud import item_history as history_crud
from app.models.backlog_item import BacklogItem
from app.models.rice_score import RICEScore


def _touch_item(db: Session, item_id: UUID) -> None:
    db.execute(
        update(BacklogItem)
        .where(BacklogItem.id == item_id)
        .values(updated_at=func.now())
    )


def get_my_score(
    db: Session, *, item_id: UUID, user_id: UUID
) -> RICEScore | None:
    return db.execute(
        select(RICEScore).where(
            RICEScore.item_id == item_id,
            RICEScore.user_id == user_id,
        )
    ).scalar_one_or_none()


def upsert_rice_score(
    db: Session,
    *,
    item_id: UUID,
    user_id: UUID,
    reach: float,
    impact: float,
    confidence: float,
    effort: float,
) -> RICEScore:
    """Per-user upsert. The (item_id, user_id) pair is unique — two
    different users can have side-by-side scores for the same item."""
    score_value = RICEScore.compute(
        reach=reach, impact=impact, confidence=confidence, effort=effort
    )
    existing = get_my_score(db, item_id=item_id, user_id=user_id)
    history_crud.record_score_change(
        db,
        item_id=item_id,
        before=existing,
        after_values={
            "reach": reach,
            "impact": impact,
            "confidence": confidence,
            "effort": effort,
            "score": score_value,
        },
    )
    if existing is None:
        rice = RICEScore(
            item_id=item_id,
            user_id=user_id,
            reach=reach,
            impact=impact,
            confidence=confidence,
            effort=effort,
            score=score_value,
        )
        db.add(rice)
    else:
        existing.reach = reach
        existing.impact = impact
        existing.confidence = confidence
        existing.effort = effort
        existing.score = score_value
        rice = existing
    _touch_item(db, item_id)
    db.commit()
    db.refresh(rice)
    return rice


def delete_rice_score(
    db: Session, *, item_id: UUID, user_id: UUID
) -> None:
    """Remove only the calling user's score for this item. Other
    members' rows are left untouched. Idempotent: silently noops when
    the user hasn't scored this item yet."""
    existing = get_my_score(db, item_id=item_id, user_id=user_id)
    if existing is None:
        return
    history_crud.record_score_change(
        db, item_id=item_id, before=existing, after_values=None
    )
    db.delete(existing)
    _touch_item(db, item_id)
    db.commit()


def list_my_scores_for_workspace(
    db: Session, *, workspace_id: UUID, user_id: UUID
) -> dict[UUID, RICEScore]:
    """`{item_id: my_score}` for every item in the workspace that the
    caller has scored. Empty entries mean the caller hasn't scored
    that item yet."""
    stmt = (
        select(RICEScore)
        .join(BacklogItem, BacklogItem.id == RICEScore.item_id)
        .where(
            BacklogItem.workspace_id == workspace_id,
            RICEScore.user_id == user_id,
        )
    )
    return {row.item_id: row for row in db.execute(stmt).scalars().all()}


def list_all_scores_for_workspace(
    db: Session, *, workspace_id: UUID
) -> dict[UUID, list[RICEScore]]:
    """`{item_id: [score_per_user, ...]}` across every member of the
    workspace. Drives the aggregate (mean + variance + contributor
    count) shown alongside the caller's own score."""
    stmt = (
        select(RICEScore)
        .join(BacklogItem, BacklogItem.id == RICEScore.item_id)
        .where(BacklogItem.workspace_id == workspace_id)
    )
    out: dict[UUID, list[RICEScore]] = {}
    for row in db.execute(stmt).scalars().all():
        out.setdefault(row.item_id, []).append(row)
    return out


def aggregate(scores: Iterable[RICEScore]) -> dict | None:
    """Mean + variance + contributor count over the provided per-user
    score rows. Returns None when no rows are passed (caller renders
    "—" instead of "0.00")."""
    rows = list(scores)
    if not rows:
        return None
    values = [r.score for r in rows]
    mean = sum(values) / len(values)
    return {
        "score": round(mean, 2),
        "contributor_count": len(rows),
        "variance": round(pvariance(values), 2) if len(values) > 1 else 0.0,
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }


def list_board(db: Session, *, workspace_id: UUID) -> list[BacklogItem]:
    """Workspace items pre-loaded for the framework=RICE board.
    Eager-loads RICEScore via the relationship — the router then
    overlays per-user + aggregate views from the dedicated CRUD
    helpers above."""
    stmt = (
        select(BacklogItem)
        .where(BacklogItem.workspace_id == workspace_id)
        .options(selectinload(BacklogItem.rice_score))
        .order_by(BacklogItem.created_at.asc())
    )
    items = list(db.execute(stmt).scalars().all())
    # Sort happens in the router because the "score DESC" key depends
    # on the aggregate computed from per-user rows, which we don't
    # have at the model level. We just hand back items in created_at
    # order; the router will re-sort.
    _ = nulls_last  # keep import for future SQL-side sort if we refactor
    return items
