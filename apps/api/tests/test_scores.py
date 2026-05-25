# /apps/api/tests/test_scores.py
#
# End-to-end tests for the unified POST /v1/score endpoint and the
# framework-aware board view.

from __future__ import annotations

import pytest

NIL_UUID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture()
def workspace_factory(client):
    def make(framework: str = "RICE", name: str | None = None):
        body = {
            "name": name or f"WS-{framework}",
            "owner_email": f"{framework.lower()}@example.com",
        }
        if framework != "RICE":
            body["framework"] = framework
        return client.post("/v1/workspaces", json=body).json()
    return make


@pytest.fixture()
def item_factory(client):
    def make(workspace_id: str, title: str = "Item"):
        return client.post(
            f"/v1/workspaces/{workspace_id}/items", json={"title": title}
        ).json()
    return make


def test_unified_endpoint_persists_rice_score(client, workspace_factory, item_factory):
    """RICE writes through the unified endpoint land in `rice_scores`
    (legacy table) so the existing board path stays consistent."""
    ws = workspace_factory("RICE")
    item = item_factory(ws["id"])
    response = client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "RICE",
            "inputs": {"reach": 1000, "impact": 2, "confidence": 0.8, "effort": 4},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["framework"] == "RICE"
    assert body["score"] == 400
    # Board shows the score via rice_score field (legacy path).
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    assert board[0]["rice_score"]["score"] == 400
    assert board[0]["score"] is None


def test_unified_endpoint_persists_ice_score(client, workspace_factory, item_factory):
    ws = workspace_factory("ICE")
    item = item_factory(ws["id"])
    response = client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "ICE",
            "inputs": {"impact": 8, "confidence": 7, "ease": 9},
        },
    )
    assert response.status_code == 200
    assert response.json()["score"] == 504
    # ICE board surfaces via the polymorphic `score` field; `rice_score`
    # stays null even though item could have legacy RICE data.
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    assert board[0]["rice_score"] is None
    assert board[0]["score"]["framework"] == "ICE"
    assert board[0]["score"]["score"] == 504


def test_unified_endpoint_persists_moscow_bucket(client, workspace_factory, item_factory):
    ws = workspace_factory("MoSCoW")
    item = item_factory(ws["id"])
    response = client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "MoSCoW",
            "inputs": {"bucket": "Must"},
        },
    )
    assert response.status_code == 200
    assert response.json()["score"] == 4  # Must = rank 4
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    assert board[0]["score"]["inputs"]["bucket"] == "Must"


def test_unified_endpoint_persists_value_effort(client, workspace_factory, item_factory):
    ws = workspace_factory("ValueEffort")
    item = item_factory(ws["id"])
    response = client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "ValueEffort",
            "inputs": {"value": 8, "effort": 2},
        },
    )
    assert response.status_code == 200
    assert response.json()["score"] == 4


def test_unified_endpoint_rejects_unknown_framework(client, item_factory, workspace_factory):
    item = item_factory(workspace_factory("RICE")["id"])
    response = client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "PIE",
            "inputs": {"x": 1},
        },
    )
    # Framework Literal mismatch fails at the request-schema layer.
    assert response.status_code == 422


def test_unified_endpoint_rejects_bad_inputs(client, item_factory, workspace_factory):
    item = item_factory(workspace_factory("ICE")["id"])
    response = client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "ICE",
            "inputs": {"impact": 5},  # missing confidence + ease
        },
    )
    assert response.status_code == 422


def test_unified_endpoint_404s_unknown_item(client):
    response = client.post(
        "/v1/score",
        json={
            "item_id": NIL_UUID,
            "framework": "ICE",
            "inputs": {"impact": 1, "confidence": 1, "ease": 1},
        },
    )
    assert response.status_code == 404


def test_re_scoring_updates_in_place(client, workspace_factory, item_factory):
    ws = workspace_factory("ICE")
    item = item_factory(ws["id"])
    client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "ICE",
            "inputs": {"impact": 5, "confidence": 5, "ease": 5},
        },
    )
    client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "ICE",
            "inputs": {"impact": 10, "confidence": 10, "ease": 10},
        },
    )
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    assert len(board) == 1
    assert board[0]["score"]["score"] == 1000


def test_delete_polymorphic_score_clears_only_that_framework(
    client, workspace_factory, item_factory
):
    ws = workspace_factory("ICE")
    item = item_factory(ws["id"])
    client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "ICE",
            "inputs": {"impact": 5, "confidence": 5, "ease": 5},
        },
    )
    response = client.delete(
        f"/v1/items/{item['id']}/score?framework=ICE"
    )
    assert response.status_code == 204
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    assert board[0]["score"] is None


def test_board_sorts_non_rice_by_score_desc(
    client, workspace_factory, item_factory
):
    """Higher score should appear before lower; unscored falls to the end."""
    ws = workspace_factory("ICE")
    low = item_factory(ws["id"], "Low priority")
    high = item_factory(ws["id"], "High priority")
    item_factory(ws["id"], "Unscored")
    client.post(
        "/v1/score",
        json={
            "item_id": low["id"],
            "framework": "ICE",
            "inputs": {"impact": 2, "confidence": 2, "ease": 2},
        },
    )
    client.post(
        "/v1/score",
        json={
            "item_id": high["id"],
            "framework": "ICE",
            "inputs": {"impact": 9, "confidence": 9, "ease": 9},
        },
    )
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    titles = [row["title"] for row in board]
    assert titles == ["High priority", "Low priority", "Unscored"]


def test_switching_framework_on_workspace_isolates_scores(
    client, workspace_factory, item_factory
):
    """An ICE board shouldn't show RICE data, and vice-versa — each
    framework reads its own table.

    Implementation detail: writing RICE under the unified endpoint when
    the workspace later flips to ICE means the legacy RICE row still
    exists for that item but is invisible on the ICE board until the
    user scores under ICE."""
    ws = workspace_factory("RICE")
    item = item_factory(ws["id"])
    client.post(
        "/v1/score",
        json={
            "item_id": item["id"],
            "framework": "RICE",
            "inputs": {"reach": 1000, "impact": 1, "confidence": 1, "effort": 1},
        },
    )
    # Switch the workspace to ICE.
    client.patch(f"/v1/workspaces/{ws['id']}", json={"framework": "ICE"})
    board = client.get(f"/v1/workspaces/{ws['id']}/board").json()
    # RICE legacy row hidden; no ICE score yet → unscored on the board.
    assert board[0]["rice_score"] is None
    assert board[0]["score"] is None
