# /apps/api/tests/test_prioritization.py

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy import update as sa_update

from app.models.backlog_item import BacklogItem
from app.models.rice_score import RICEScore

NIL_UUID = "00000000-0000-0000-0000-000000000000"


def _naive_utc(seconds_ago: int = 0) -> datetime:
    """SQLite returns naive datetimes from `DateTime(timezone=True)` columns
    (and func.now() in UTC), so the test-side anchor must also be naive to
    avoid offset-naive vs offset-aware comparison errors."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=seconds_ago)


@pytest.fixture()
def workspace_id(client) -> str:
    response = client.post(
        "/v1/workspaces",
        json={"name": "Scoring WS", "owner_email": "scorer@example.com"},
    )
    return response.json()["id"]


@pytest.fixture()
def item_id(client, workspace_id) -> str:
    response = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Scorable item"}
    )
    return response.json()["id"]


def test_rice_score_basic(client, item_id):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": 1000,
            "impact": 2,
            "confidence": 0.8,
            "effort": 4,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["framework"] == "RICE"
    assert data["score"] == 400.0
    assert data["item_id"] == item_id


def test_rice_score_404_unknown_item(client):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": NIL_UUID,
            "reach": 1000,
            "impact": 1,
            "confidence": 0.5,
            "effort": 2,
        },
    )
    assert response.status_code == 404


def test_rice_score_upserts_not_duplicates(client, db_session, item_id):
    first = client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": 1000,
            "impact": 1,
            "confidence": 0.5,
            "effort": 2,
        },
    )
    assert first.status_code == 200
    assert first.json()["score"] == 250.0

    second = client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": 2000,
            "impact": 1,
            "confidence": 0.5,
            "effort": 1,
        },
    )
    assert second.status_code == 200
    assert second.json()["score"] == 1000.0

    count = db_session.execute(
        select(func.count(RICEScore.id)).where(RICEScore.item_id == UUID(item_id))
    ).scalar_one()
    assert count == 1


def test_score_bumps_parent_item_updated_at(client, db_session, workspace_id):
    """Scoring an item must touch BacklogItem.updated_at, not just
    RICEScore.updated_at — otherwise a future 'recently modified items'
    view would miss score-only changes."""
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Scorable"}
    )
    item_uuid = UUID(create.json()["id"])

    # Anchor updated_at in the past so the touch is unambiguously visible
    # regardless of underlying clock precision.
    old_ts = _naive_utc(seconds_ago=30)
    db_session.execute(
        sa_update(BacklogItem)
        .where(BacklogItem.id == item_uuid)
        .values(updated_at=old_ts)
    )
    db_session.commit()

    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": str(item_uuid),
            "reach": 1000,
            "impact": 1,
            "confidence": 0.5,
            "effort": 2,
        },
    )
    assert response.status_code == 200

    db_session.expire_all()
    item_after = db_session.get(BacklogItem, item_uuid)
    assert item_after is not None
    assert item_after.updated_at > old_ts


def test_delete_rice_also_touches_parent_item(client, db_session, workspace_id, item_id):
    """Removing a score is also a state change — touch updated_at on the
    parent so activity-sorted views stay accurate."""
    # Establish a score first.
    client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": 1000,
            "impact": 1,
            "confidence": 0.5,
            "effort": 2,
        },
    )

    item_uuid = UUID(item_id)
    old_ts = _naive_utc(seconds_ago=30)
    db_session.execute(
        sa_update(BacklogItem)
        .where(BacklogItem.id == item_uuid)
        .values(updated_at=old_ts)
    )
    db_session.commit()

    assert client.delete(f"/v1/items/{item_id}/rice").status_code == 204

    db_session.expire_all()
    item_after = db_session.get(BacklogItem, item_uuid)
    assert item_after is not None
    assert item_after.updated_at > old_ts


def test_rice_rejects_zero_effort(client, item_id):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": 1000,
            "impact": 2,
            "confidence": 0.8,
            "effort": 0,
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("confidence", [-0.1, 1.5, 2.0])
def test_rice_rejects_invalid_confidence(client, item_id, confidence):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": 1000,
            "impact": 1,
            "confidence": confidence,
            "effort": 1,
        },
    )
    assert response.status_code == 422


def test_rice_rejects_non_uuid_item_id(client):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": "FEAT-001",
            "reach": 1000,
            "impact": 1,
            "confidence": 0.5,
            "effort": 1,
        },
    )
    assert response.status_code == 422


def test_ice_score_basic(client):
    response = client.post(
        "/v1/score/ice",
        json={
            "item_id": "FEAT-003",
            "impact": 8,
            "confidence": 7,
            "ease": 6,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["framework"] == "ICE"
    assert data["score"] == 336.0
    assert data["item_id"] == "FEAT-003"


def test_healthcheck(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def _create_item(client, workspace_id: str, title: str) -> str:
    return client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": title}
    ).json()["id"]


def _score(client, item_id: str, *, reach: float, effort: float = 1.0) -> None:
    client.post(
        "/v1/score/rice",
        json={
            "item_id": item_id,
            "reach": reach,
            "impact": 1,
            "confidence": 0.5,
            "effort": effort,
        },
    )


def test_board_sorts_by_score_desc_unscored_last(client, workspace_id):
    low_id = _create_item(client, workspace_id, "Low score")
    high_id = _create_item(client, workspace_id, "High score")
    _create_item(client, workspace_id, "Unscored")

    _score(client, low_id, reach=100)   # 100 * 1 * 0.5 / 1 = 50
    _score(client, high_id, reach=1000)  # 1000 * 1 * 0.5 / 1 = 500

    response = client.get(f"/v1/workspaces/{workspace_id}/board")
    assert response.status_code == 200
    data = response.json()
    assert [it["title"] for it in data] == ["High score", "Low score", "Unscored"]
    assert data[0]["rice_score"]["score"] == 500.0
    assert data[1]["rice_score"]["score"] == 50.0
    assert data[2]["rice_score"] is None


def test_board_returns_empty_list_for_workspace_with_no_items(client, workspace_id):
    response = client.get(f"/v1/workspaces/{workspace_id}/board")
    assert response.status_code == 200
    assert response.json() == []


def test_board_404_unknown_workspace(client):
    response = client.get(f"/v1/workspaces/{NIL_UUID}/board")
    assert response.status_code == 404


def test_delete_rice_removes_score(client, workspace_id, item_id):
    _score(client, item_id, reach=100)
    assert client.get(f"/v1/workspaces/{workspace_id}/board").json()[0]["rice_score"] is not None

    response = client.delete(f"/v1/items/{item_id}/rice")
    assert response.status_code == 204

    board = client.get(f"/v1/workspaces/{workspace_id}/board").json()
    assert len(board) == 1
    assert board[0]["rice_score"] is None


def test_delete_rice_idempotent_on_unscored_item(client, item_id):
    first = client.delete(f"/v1/items/{item_id}/rice")
    assert first.status_code == 204
    second = client.delete(f"/v1/items/{item_id}/rice")
    assert second.status_code == 204


def test_delete_rice_404_unknown_item(client):
    response = client.delete(f"/v1/items/{NIL_UUID}/rice")
    assert response.status_code == 404
