# /apps/api/tests/test_workspaces.py

from __future__ import annotations

NIL_UUID = "00000000-0000-0000-0000-000000000000"


def test_create_workspace(client):
    response = client.post(
        "/v1/workspaces",
        json={"name": "Team Alpha", "owner_email": "alice@example.com"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Team Alpha"
    assert "id" in data
    assert "owner_id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_workspace_creates_user_on_the_fly(client):
    response = client.post(
        "/v1/workspaces",
        json={"name": "Solo Lab", "owner_email": "newperson@example.com"},
    )
    assert response.status_code == 201

    listing = client.get("/v1/workspaces", params={"owner_email": "newperson@example.com"})
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_create_workspace_reuses_existing_user(client):
    first = client.post(
        "/v1/workspaces",
        json={"name": "First", "owner_email": "alice@example.com"},
    )
    second = client.post(
        "/v1/workspaces",
        json={"name": "Second", "owner_email": "alice@example.com"},
    )
    assert first.json()["owner_id"] == second.json()["owner_id"]


def test_create_workspace_rejects_invalid_email(client):
    response = client.post(
        "/v1/workspaces",
        json={"name": "Bad email", "owner_email": "not-an-email"},
    )
    assert response.status_code == 422


def test_create_workspace_rejects_blank_name(client):
    response = client.post(
        "/v1/workspaces",
        json={"name": "", "owner_email": "alice@example.com"},
    )
    assert response.status_code == 422


def test_list_workspaces_filter_by_owner(client):
    client.post("/v1/workspaces", json={"name": "Alice WS", "owner_email": "alice@example.com"})
    client.post("/v1/workspaces", json={"name": "Bob WS", "owner_email": "bob@example.com"})

    response = client.get("/v1/workspaces", params={"owner_email": "alice@example.com"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Alice WS"


def test_list_workspaces_returns_all_without_filter(client):
    client.post("/v1/workspaces", json={"name": "Alice WS", "owner_email": "alice@example.com"})
    client.post("/v1/workspaces", json={"name": "Bob WS", "owner_email": "bob@example.com"})

    response = client.get("/v1/workspaces")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_workspaces_unknown_owner_returns_empty(client):
    client.post("/v1/workspaces", json={"name": "Some WS", "owner_email": "alice@example.com"})
    response = client.get("/v1/workspaces", params={"owner_email": "nobody@example.com"})
    assert response.status_code == 200
    assert response.json() == []


def test_get_workspace_returns_metadata_only(client):
    """GET /v1/workspaces/{id} returns workspace metadata only — items live
    on /board (where they get the proper score-based ordering). Returning
    items here would mean two separate fetches load the same data when the
    frontend wants the sorted board view."""
    create_resp = client.post(
        "/v1/workspaces", json={"name": "Team", "owner_email": "owner@example.com"}
    )
    ws_id = create_resp.json()["id"]

    client.post(f"/v1/workspaces/{ws_id}/items", json={"title": "First item"})

    response = client.get(f"/v1/workspaces/{ws_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Team"
    assert data["id"] == ws_id
    assert "items" not in data


def test_get_workspace_404(client):
    response = client.get(f"/v1/workspaces/{NIL_UUID}")
    assert response.status_code == 404


def test_delete_workspace(client):
    create_resp = client.post(
        "/v1/workspaces", json={"name": "To Delete", "owner_email": "x@example.com"}
    )
    ws_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/v1/workspaces/{ws_id}")
    assert delete_resp.status_code == 204

    get_resp = client.get(f"/v1/workspaces/{ws_id}")
    assert get_resp.status_code == 404


def test_delete_workspace_cascades_to_items(client):
    create_resp = client.post(
        "/v1/workspaces", json={"name": "WS with items", "owner_email": "x@example.com"}
    )
    ws_id = create_resp.json()["id"]
    client.post(f"/v1/workspaces/{ws_id}/items", json={"title": "Doomed item"})

    assert client.delete(f"/v1/workspaces/{ws_id}").status_code == 204
    # Workspace is gone, so item access goes via workspace 404 path.
    assert client.get(f"/v1/workspaces/{ws_id}/items").status_code == 404


def test_delete_workspace_404(client):
    response = client.delete(f"/v1/workspaces/{NIL_UUID}")
    assert response.status_code == 404
