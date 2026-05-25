# /apps/api/tests/test_item_history.py

from __future__ import annotations

import pytest

NIL_UUID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture()
def item(client) -> dict:
    ws = client.post(
        "/v1/workspaces",
        json={"name": "Hist WS", "owner_email": "hist@example.com"},
    )
    workspace_id = ws.json()["id"]
    created = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={"title": "Trackable", "description": "before", "tags": ["a"]},
    )
    return created.json()


def _history(client, item_id: str) -> list[dict]:
    response = client.get(f"/v1/items/{item_id}/history")
    assert response.status_code == 200
    return response.json()


def test_history_empty_on_new_item(client, item):
    """Just creating an item doesn't write history — there's nothing
    to diff against. First scoring or first field change starts the log."""
    assert _history(client, item["id"]) == []


def test_score_creates_history_entry(client, item):
    response = client.post(
        "/v1/score/rice",
        json={
            "item_id": item["id"],
            "reach": 1000,
            "impact": 1,
            "confidence": 0.8,
            "effort": 2,
        },
    )
    assert response.status_code == 200

    entries = _history(client, item["id"])
    assert len(entries) == 1
    entry = entries[0]
    assert entry["kind"] == "score"
    assert entry["before"] is None
    assert entry["after"]["reach"] == 1000
    assert entry["after"]["impact"] == 1
    assert entry["after"]["confidence"] == 0.8
    assert entry["after"]["effort"] == 2
    assert entry["after"]["score"] == 400


def test_score_update_records_before_and_after(client, item):
    base = {
        "item_id": item["id"],
        "reach": 1000,
        "impact": 1,
        "confidence": 0.8,
        "effort": 2,
    }
    client.post("/v1/score/rice", json=base)
    client.post("/v1/score/rice", json={**base, "reach": 5000, "effort": 4})

    entries = _history(client, item["id"])
    # Newest first.
    assert len(entries) == 2
    latest, first = entries
    assert first["before"] is None
    assert latest["before"]["reach"] == 1000
    assert latest["before"]["effort"] == 2
    assert latest["after"]["reach"] == 5000
    assert latest["after"]["effort"] == 4


def test_score_resave_with_identical_values_writes_no_history(client, item):
    """A PATCH that re-saves the same RICE numbers shouldn't pollute the
    log — `record_score_change` short-circuits when nothing changed."""
    payload = {
        "item_id": item["id"],
        "reach": 1000,
        "impact": 1,
        "confidence": 0.8,
        "effort": 2,
    }
    client.post("/v1/score/rice", json=payload)
    client.post("/v1/score/rice", json=payload)
    client.post("/v1/score/rice", json=payload)

    assert len(_history(client, item["id"])) == 1


def test_score_clear_records_after_null(client, item):
    client.post(
        "/v1/score/rice",
        json={
            "item_id": item["id"],
            "reach": 1000,
            "impact": 1,
            "confidence": 0.8,
            "effort": 2,
        },
    )
    response = client.delete(f"/v1/items/{item['id']}/rice")
    assert response.status_code == 204

    entries = _history(client, item["id"])
    assert len(entries) == 2
    latest = entries[0]
    assert latest["kind"] == "score"
    assert latest["after"] is None
    assert latest["before"]["reach"] == 1000


def test_field_change_records_only_diff_keys(client, item):
    response = client.patch(
        f"/v1/items/{item['id']}",
        json={"title": "Renamed", "description": "before"},  # description unchanged
    )
    assert response.status_code == 200

    entries = _history(client, item["id"])
    assert len(entries) == 1
    entry = entries[0]
    assert entry["kind"] == "fields"
    # Only `title` changed — description should not appear in the diff.
    assert set(entry["before"].keys()) == {"title"}
    assert entry["before"]["title"] == "Trackable"
    assert entry["after"]["title"] == "Renamed"


def test_field_resave_with_identical_values_writes_no_history(client, item):
    client.patch(f"/v1/items/{item['id']}", json={"title": "Trackable"})
    assert _history(client, item["id"]) == []


def test_tag_change_recorded(client, item):
    client.patch(f"/v1/items/{item['id']}", json={"tags": ["a", "b"]})

    entries = _history(client, item["id"])
    assert len(entries) == 1
    entry = entries[0]
    assert entry["kind"] == "fields"
    assert entry["before"]["tags"] == ["a"]
    assert entry["after"]["tags"] == ["a", "b"]


def test_history_404_unknown_item(client):
    response = client.get(f"/v1/items/{NIL_UUID}/history")
    assert response.status_code == 404


def test_history_chronological_order(client, item):
    """Newest first; timestamps may collide within the same second on
    SQLite, so the `id` tiebreaker keeps the order deterministic."""
    client.patch(f"/v1/items/{item['id']}", json={"title": "v2"})
    client.patch(f"/v1/items/{item['id']}", json={"title": "v3"})
    client.patch(f"/v1/items/{item['id']}", json={"title": "v4"})

    entries = _history(client, item["id"])
    titles = [e["after"]["title"] for e in entries]
    assert titles == ["v4", "v3", "v2"]
