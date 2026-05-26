# /apps/api/tests/test_users.py

from __future__ import annotations


def test_get_me_returns_current_user(client):
    response = client.get("/v1/users/me")
    assert response.status_code == 200
    body = response.json()
    # conftest pins AUTH_DISABLED + DEV_USER_EMAIL, so /me reflects the
    # dev fixture user.
    assert body["email"] == "dev@frameboard.test"
    assert body["notion_configured"] is False
    assert body["notion_database_id"] is None


def test_patch_me_stores_notion_credentials(client):
    response = client.patch(
        "/v1/users/me",
        json={
            "notion_access_token": "secret_token_xyz",
            "notion_database_id": "db-1234",
        },
    )
    assert response.status_code == 200
    body = response.json()
    # The token is never echoed back; the frontend only learns whether
    # one is configured + the (non-secret) database id.
    assert body["notion_configured"] is True
    assert body["notion_database_id"] == "db-1234"
    assert "notion_access_token" not in body


def test_patch_me_empty_string_disconnects(client):
    client.patch(
        "/v1/users/me",
        json={
            "notion_access_token": "secret",
            "notion_database_id": "db-1",
        },
    )
    response = client.patch(
        "/v1/users/me",
        json={"notion_access_token": "", "notion_database_id": ""},
    )
    assert response.status_code == 200
    assert response.json()["notion_configured"] is False
    assert response.json()["notion_database_id"] is None


def test_patch_me_partial_leaves_other_field_alone(client):
    """PATCH semantics: omit a field → leave it untouched. Useful for
    updating just the database id without re-sending the token."""
    client.patch(
        "/v1/users/me",
        json={
            "notion_access_token": "secret_a",
            "notion_database_id": "db-1",
        },
    )
    # Send only the database id; token should stay.
    response = client.patch(
        "/v1/users/me", json={"notion_database_id": "db-2"}
    )
    assert response.status_code == 200
    assert response.json()["notion_configured"] is True
    assert response.json()["notion_database_id"] == "db-2"
