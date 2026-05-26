# /apps/api/tests/test_auth.py
#
# Auth tests cover two surfaces:
# 1. The AUTH_DISABLED=1 dev path with X-Dev-User identity scoping -
#    exercises ownership isolation between simulated users.
# 2. The JWT verification path - flips settings.auth_disabled OFF for
#    one test so we can validate the production header parsing without
#    a separate test process.

from __future__ import annotations

import time
from datetime import UTC, datetime

import pytest
from jose import jwt

from app.core.config import settings

NIL_UUID = "00000000-0000-0000-0000-000000000000"


def _make_jwt(email: str, *, secret: str | None = None, name: str = "Alice") -> str:
    """Mints a NextAuth-shaped HS256 JWT. The backend's deps decode this
    with the same secret and pull `email` / `name` claims out."""
    now = int(time.time())
    payload = {
        "email": email,
        "name": name,
        "iat": now,
        "exp": now + 3600,
        "sub": email,
    }
    return jwt.encode(
        payload, secret or settings.nextauth_secret, algorithm="HS256"
    )


# ─── AUTH_DISABLED + X-Dev-User scoping ─────────────────────────────


def test_workspace_invisible_to_other_dev_user(client, client_as):
    """A workspace created by Alice does not appear in Bob's listing,
    and Bob can't fetch it by id."""
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "Alice WS"}).json()
    with client_as(client, "bob@example.com") as bob:
        list_resp = bob.get("/v1/workspaces")
        get_resp = bob.get(f"/v1/workspaces/{ws['id']}")
    assert list_resp.json() == []
    # 404 (not 403) - don't leak existence to non-owners.
    assert get_resp.status_code == 404


def test_cannot_patch_other_users_workspace(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "Alice WS"}).json()
    with client_as(client, "mallory@example.com") as mallory:
        response = mallory.patch(
            f"/v1/workspaces/{ws['id']}", json={"name": "Pwned"}
        )
    assert response.status_code == 404


def test_cannot_delete_other_users_workspace(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "Keep me"}).json()
    with client_as(client, "mallory@example.com") as mallory:
        response = mallory.delete(f"/v1/workspaces/{ws['id']}")
    assert response.status_code == 404
    # Alice's workspace still exists.
    with client_as(client, "alice@example.com") as alice:
        assert alice.get(f"/v1/workspaces/{ws['id']}").status_code == 200


def test_cannot_score_item_in_other_users_workspace(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "WS"}).json()
        item = alice.post(
            f"/v1/workspaces/{ws['id']}/items", json={"title": "Item"}
        ).json()
    with client_as(client, "mallory@example.com") as mallory:
        response = mallory.post(
            "/v1/score/rice",
            json={
                "item_id": item["id"],
                "reach": 100,
                "impact": 1,
                "confidence": 1,
                "effort": 1,
            },
        )
    assert response.status_code == 404


def test_cannot_read_history_of_other_users_item(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "WS"}).json()
        item = alice.post(
            f"/v1/workspaces/{ws['id']}/items", json={"title": "Item"}
        ).json()
        alice.patch(f"/v1/items/{item['id']}", json={"title": "Bumped"})
    with client_as(client, "mallory@example.com") as mallory:
        response = mallory.get(f"/v1/items/{item['id']}/history")
    assert response.status_code == 404


def test_x_dev_user_header_creates_user_on_first_request(client, client_as):
    """A brand-new email materialises a User row the first time it's
    used - the dev path mirrors the OAuth/JWT path's get-or-create
    behaviour, so contributors don't have to pre-seed identities."""
    with client_as(client, "fresh@example.com") as fresh:
        ws = fresh.post("/v1/workspaces", json={"name": "Hello"})
    assert ws.status_code == 201


# ─── JWT verification path ──────────────────────────────────────────


@pytest.fixture()
def auth_enabled(monkeypatch):
    """Flips AUTH_DISABLED off for one test so the JWT branch runs.
    Restores the original value automatically because monkeypatch
    teardown reverts attribute changes."""
    monkeypatch.setattr(settings, "auth_disabled", "0")


def test_missing_authorization_header_returns_401(client, auth_enabled):
    response = client.get("/v1/workspaces")
    assert response.status_code == 401
    assert "Authorization" in response.json()["detail"]


def test_invalid_jwt_returns_401(client, auth_enabled):
    response = client.get(
        "/v1/workspaces", headers={"Authorization": "Bearer not.a.jwt"}
    )
    assert response.status_code == 401


def test_jwt_signed_with_wrong_secret_returns_401(client, auth_enabled):
    token = _make_jwt("alice@example.com", secret="not-the-real-secret")
    response = client.get(
        "/v1/workspaces", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401


def test_valid_jwt_lets_request_through(client, auth_enabled):
    token = _make_jwt("alice@example.com")
    response = client.get(
        "/v1/workspaces", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json() == []


def test_jwt_email_is_used_as_user_identity(client, auth_enabled):
    """Two requests with the same email JWT must hit the same user
    (workspace from request 1 is visible to request 2)."""
    token = _make_jwt("alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    client.post(
        "/v1/workspaces", json={"name": "Alice WS"}, headers=headers
    )
    response = client.get("/v1/workspaces", headers=headers)
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "Alice WS"


def test_jwt_without_email_claim_returns_401(client, auth_enabled):
    """A JWT with the right signature but no `email` claim is rejected -
    the email is the identity we key on."""
    payload = {
        "name": "Anon",
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int(datetime.now(UTC).timestamp()) + 3600,
    }
    token = jwt.encode(
        payload, settings.nextauth_secret, algorithm="HS256"
    )
    response = client.get(
        "/v1/workspaces", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401
