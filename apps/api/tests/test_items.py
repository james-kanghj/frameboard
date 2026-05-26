# /apps/api/tests/test_items.py

from __future__ import annotations

import pytest

NIL_UUID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture()
def workspace_id(client) -> str:
    response = client.post(
        "/v1/workspaces",
        json={"name": "Items WS", "owner_email": "items@example.com"},
    )
    return response.json()["id"]


def test_create_item(client, workspace_id):
    response = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={"title": "Add dark mode", "description": "Toggle in user settings"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Add dark mode"
    assert data["description"] == "Toggle in user settings"
    assert data["workspace_id"] == workspace_id
    assert data["rice_score"] is None
    assert data["tags"] == []


def test_create_item_with_tags_normalises(client, workspace_id):
    """Tags are trimmed, deduped (case-insensitive), blanks dropped,
    and over-long entries skipped - backend is the source of truth."""
    response = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={
            "title": "Tagged item",
            "tags": [
                "feature",
                "  feature  ",  # trims, then dedupes against the first
                "Feature",  # case-insensitive dedupe
                "",  # empty, dropped
                "infra",
                "x" * 31,  # too long, dropped
            ],
        },
    )
    assert response.status_code == 201
    assert response.json()["tags"] == ["feature", "infra"]


def test_update_item_tags_clears_and_replaces(client, workspace_id):
    created = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={"title": "Tag me", "tags": ["a", "b", "c"]},
    )
    item_id = created.json()["id"]

    # Replace with a smaller set.
    response = client.patch(f"/v1/items/{item_id}", json={"tags": ["x"]})
    assert response.status_code == 200
    assert response.json()["tags"] == ["x"]

    # Empty list explicitly clears tags.
    response = client.patch(f"/v1/items/{item_id}", json={"tags": []})
    assert response.status_code == 200
    assert response.json()["tags"] == []

    # Omitting tags entirely leaves them alone (smoke: set, then update title only).
    client.patch(f"/v1/items/{item_id}", json={"tags": ["kept"]})
    response = client.patch(f"/v1/items/{item_id}", json={"title": "Title only"})
    assert response.status_code == 200
    assert response.json()["title"] == "Title only"
    assert response.json()["tags"] == ["kept"]


def test_create_item_no_description(client, workspace_id):
    response = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Plain item"}
    )
    assert response.status_code == 201
    assert response.json()["description"] is None


def test_create_item_rejects_blank_title(client, workspace_id):
    response = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": ""}
    )
    assert response.status_code == 422


def test_create_item_unknown_workspace(client):
    response = client.post(
        f"/v1/workspaces/{NIL_UUID}/items",
        json={"title": "Orphan"},
    )
    assert response.status_code == 404


def test_list_items(client, workspace_id):
    client.post(f"/v1/workspaces/{workspace_id}/items", json={"title": "Item 1"})
    client.post(f"/v1/workspaces/{workspace_id}/items", json={"title": "Item 2"})

    response = client.get(f"/v1/workspaces/{workspace_id}/items")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_items_unknown_workspace(client):
    response = client.get(f"/v1/workspaces/{NIL_UUID}/items")
    assert response.status_code == 404


def test_update_item_title(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Original"}
    )
    item_id = create.json()["id"]

    response = client.patch(f"/v1/items/{item_id}", json={"title": "Updated"})
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"


def test_update_item_description(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={"title": "Item", "description": "old"},
    )
    item_id = create.json()["id"]

    response = client.patch(f"/v1/items/{item_id}", json={"description": "new"})
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "new"
    assert data["title"] == "Item"


def test_update_item_partial_doesnt_clobber_unsent_fields(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={"title": "Keep title", "description": "Keep description"},
    )
    item_id = create.json()["id"]

    response = client.patch(f"/v1/items/{item_id}", json={"title": "New title"})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "New title"
    assert data["description"] == "Keep description"


def test_update_item_explicit_null_clears_description(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items",
        json={"title": "Item", "description": "soon to be null"},
    )
    item_id = create.json()["id"]

    response = client.patch(f"/v1/items/{item_id}", json={"description": None})
    assert response.status_code == 200
    assert response.json()["description"] is None


def test_update_item_404(client):
    response = client.patch(f"/v1/items/{NIL_UUID}", json={"title": "X"})
    assert response.status_code == 404


def test_delete_item(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Bye"}
    )
    item_id = create.json()["id"]

    response = client.delete(f"/v1/items/{item_id}")
    assert response.status_code == 204

    list_resp = client.get(f"/v1/workspaces/{workspace_id}/items")
    assert list_resp.json() == []


def test_delete_item_404(client):
    response = client.delete(f"/v1/items/{NIL_UUID}")
    assert response.status_code == 404


def test_item_starts_uncompleted(client, workspace_id):
    response = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Fresh item"}
    )
    assert response.status_code == 201
    assert response.json()["completed_at"] is None


def test_mark_item_completed(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Ship me"}
    )
    item_id = create.json()["id"]
    response = client.patch(
        f"/v1/items/{item_id}",
        json={"completed_at": "2026-05-26T01:00:00+00:00"},
    )
    assert response.status_code == 200
    completed = response.json()["completed_at"]
    # Pydantic strips the timezone for naive serialization; the round
    # trip preserves the wall-clock time, which is what we care about.
    assert completed is not None
    assert completed.startswith("2026-05-26T01:00:00")


def test_unmark_item_with_explicit_null(client, workspace_id):
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Reopen me"}
    )
    item_id = create.json()["id"]
    client.patch(
        f"/v1/items/{item_id}",
        json={"completed_at": "2026-05-26T01:00:00+00:00"},
    )
    response = client.patch(
        f"/v1/items/{item_id}", json={"completed_at": None}
    )
    assert response.status_code == 200
    assert response.json()["completed_at"] is None


def test_completed_items_sink_to_bottom_of_board(client, workspace_id):
    """Board ordering: completed items follow open ones, regardless of
    score. Two items scored, then the higher-scored one is completed -
    it should drop below the lower-scored open one."""
    high = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "High score"}
    ).json()
    low = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Low score"}
    ).json()
    client.post(
        "/v1/score/rice",
        json={
            "item_id": high["id"],
            "reach": 1000,
            "impact": 2,
            "confidence": 1,
            "effort": 1,
        },
    )
    client.post(
        "/v1/score/rice",
        json={
            "item_id": low["id"],
            "reach": 100,
            "impact": 1,
            "confidence": 1,
            "effort": 1,
        },
    )
    # Sanity: high before low on the open board.
    titles = [
        it["title"]
        for it in client.get(f"/v1/workspaces/{workspace_id}/board").json()
    ]
    assert titles == ["High score", "Low score"]

    # Mark the higher one completed → it sinks past the lower one.
    client.patch(
        f"/v1/items/{high['id']}",
        json={"completed_at": "2026-05-26T01:00:00+00:00"},
    )
    titles = [
        it["title"]
        for it in client.get(f"/v1/workspaces/{workspace_id}/board").json()
    ]
    assert titles == ["Low score", "High score"]


def test_completion_change_recorded_in_history(client, workspace_id):
    """Mark + unmark events show up in item history under the
    `fields` kind - no special history hook needed because
    `record_fields_change` already captures any tracked field that
    transitions."""
    create = client.post(
        f"/v1/workspaces/{workspace_id}/items", json={"title": "Track me"}
    )
    item_id = create.json()["id"]
    client.patch(
        f"/v1/items/{item_id}",
        json={"completed_at": "2026-05-26T01:00:00+00:00"},
    )
    client.patch(f"/v1/items/{item_id}", json={"completed_at": None})

    entries = client.get(f"/v1/items/{item_id}/history").json()
    # Newest first: unmark, then mark.
    assert len(entries) == 2
    assert all(e["kind"] == "fields" for e in entries)
    assert entries[0]["before"]["completed_at"] is not None
    assert entries[0]["after"]["completed_at"] is None
    assert entries[1]["before"]["completed_at"] is None
    assert entries[1]["after"]["completed_at"] is not None
