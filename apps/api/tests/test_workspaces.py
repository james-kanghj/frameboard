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
    # Framework defaults to RICE when not explicitly set.
    assert data["framework"] == "RICE"


def test_create_workspace_with_explicit_framework(client):
    response = client.post(
        "/v1/workspaces",
        json={
            "name": "ICE Lab",
            "owner_email": "alice@example.com",
            "framework": "ICE",
        },
    )
    assert response.status_code == 201
    assert response.json()["framework"] == "ICE"


def test_create_workspace_rejects_unknown_framework(client):
    response = client.post(
        "/v1/workspaces",
        json={
            "name": "Bad",
            "owner_email": "alice@example.com",
            "framework": "PIE",
        },
    )
    assert response.status_code == 422


def test_patch_workspace_changes_framework(client):
    created = client.post(
        "/v1/workspaces",
        json={"name": "WS", "owner_email": "alice@example.com"},
    )
    ws_id = created.json()["id"]
    assert created.json()["framework"] == "RICE"

    response = client.patch(
        f"/v1/workspaces/{ws_id}", json={"framework": "MoSCoW"}
    )
    assert response.status_code == 200
    assert response.json()["framework"] == "MoSCoW"
    # Name preserved.
    assert response.json()["name"] == "WS"


def test_patch_workspace_changes_name(client):
    created = client.post(
        "/v1/workspaces",
        json={"name": "Old", "owner_email": "alice@example.com"},
    )
    ws_id = created.json()["id"]

    response = client.patch(f"/v1/workspaces/{ws_id}", json={"name": "New"})
    assert response.status_code == 200
    assert response.json()["name"] == "New"
    assert response.json()["framework"] == "RICE"


def test_patch_workspace_404(client):
    response = client.patch(
        f"/v1/workspaces/{NIL_UUID}", json={"framework": "ICE"}
    )
    assert response.status_code == 404


def test_patch_workspace_rejects_unknown_framework(client):
    created = client.post(
        "/v1/workspaces",
        json={"name": "WS", "owner_email": "alice@example.com"},
    )
    ws_id = created.json()["id"]
    response = client.patch(
        f"/v1/workspaces/{ws_id}", json={"framework": "BOGUS"}
    )
    assert response.status_code == 422


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


def test_create_workspace_rejects_blank_name(client):
    response = client.post(
        "/v1/workspaces",
        json={"name": "", "owner_email": "alice@example.com"},
    )
    assert response.status_code == 422


def test_list_workspaces_returns_only_current_users_workspaces(client, client_as):
    """Listing is scoped to the authenticated user - alice's workspace
    must not appear when bob is making the request."""
    with client_as(client, "alice@example.com") as alice:
        alice.post("/v1/workspaces", json={"name": "Alice WS"})
    with client_as(client, "bob@example.com") as bob:
        bob.post("/v1/workspaces", json={"name": "Bob WS"})
        response = bob.get("/v1/workspaces")
    assert response.status_code == 200
    data = response.json()
    assert [w["name"] for w in data] == ["Bob WS"]


def test_list_workspaces_returns_all_owned(client):
    client.post("/v1/workspaces", json={"name": "WS 1"})
    client.post("/v1/workspaces", json={"name": "WS 2"})

    response = client.get("/v1/workspaces")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_workspaces_empty_for_user_with_none(client, client_as):
    """A fresh user identity sees zero workspaces, regardless of what
    other users have created."""
    client.post("/v1/workspaces", json={"name": "Default user WS"})
    with client_as(client, "newcomer@example.com") as newcomer:
        response = newcomer.get("/v1/workspaces")
    assert response.status_code == 200
    assert response.json() == []


def test_get_workspace_returns_metadata_only(client):
    """GET /v1/workspaces/{id} returns workspace metadata only - items live
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
