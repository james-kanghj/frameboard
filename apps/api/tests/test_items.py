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
