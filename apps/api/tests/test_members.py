# /apps/api/tests/test_members.py

from __future__ import annotations

NIL_UUID = "00000000-0000-0000-0000-000000000000"


def test_creating_workspace_auto_creates_owner_member(client):
    ws = client.post("/v1/workspaces", json={"name": "Solo"}).json()
    response = client.get(f"/v1/workspaces/{ws['id']}/members")
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["role"] == "owner"
    # conftest pins DEV_USER_EMAIL = dev@frameboard.test
    assert members[0]["email"] == "dev@frameboard.test"


def test_invite_creates_user_and_membership(client):
    ws = client.post("/v1/workspaces", json={"name": "Team"}).json()
    response = client.post(
        f"/v1/workspaces/{ws['id']}/members",
        json={"email": "newperson@example.com"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "newperson@example.com"
    assert body["role"] == "scorer"

    members = client.get(f"/v1/workspaces/{ws['id']}/members").json()
    assert {m["email"] for m in members} == {
        "dev@frameboard.test",
        "newperson@example.com",
    }


def test_invite_is_idempotent(client):
    ws = client.post("/v1/workspaces", json={"name": "Team"}).json()
    a = client.post(
        f"/v1/workspaces/{ws['id']}/members",
        json={"email": "alice@example.com"},
    )
    b = client.post(
        f"/v1/workspaces/{ws['id']}/members",
        json={"email": "alice@example.com"},
    )
    assert a.json()["id"] == b.json()["id"]


def test_invited_member_can_read_board(client, client_as):
    # Alice creates a workspace and invites Bob.
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Shared"}
        ).json()
        alice.post(
            f"/v1/workspaces/{ws['id']}/items",
            json={"title": "Item for Bob"},
        )
        alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        )

    # Bob can now see the workspace, list its items, and view the board.
    with client_as(client, "bob@example.com") as bob:
        listing = bob.get("/v1/workspaces").json()
        assert any(w["id"] == ws["id"] for w in listing)
        assert bob.get(f"/v1/workspaces/{ws['id']}").status_code == 200
        items = bob.get(f"/v1/workspaces/{ws['id']}/items").json()
        assert [it["title"] for it in items] == ["Item for Bob"]
        assert bob.get(f"/v1/workspaces/{ws['id']}/board").status_code == 200


def test_invited_member_can_score_and_complete_items(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Shared"}
        ).json()
        item = alice.post(
            f"/v1/workspaces/{ws['id']}/items",
            json={"title": "Score together"},
        ).json()
        alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        )

    with client_as(client, "bob@example.com") as bob:
        # Bob (scorer) can write a RICE score.
        r = bob.post(
            "/v1/score/rice",
            json={
                "item_id": item["id"],
                "reach": 500,
                "impact": 1,
                "confidence": 0.8,
                "effort": 2,
            },
        )
        assert r.status_code == 200
        # Bob can also mark complete.
        r = bob.patch(
            f"/v1/items/{item['id']}",
            json={"completed_at": "2026-05-26T01:00:00+00:00"},
        )
        assert r.status_code == 200


def test_non_member_cannot_see_workspace(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Private"}
        ).json()
    with client_as(client, "stranger@example.com") as stranger:
        # Listing doesn't include it.
        listing = stranger.get("/v1/workspaces").json()
        assert all(w["id"] != ws["id"] for w in listing)
        # Direct fetch + board both 404 (leak-prevention, not 403).
        assert stranger.get(f"/v1/workspaces/{ws['id']}").status_code == 404
        assert (
            stranger.get(f"/v1/workspaces/{ws['id']}/board").status_code
            == 404
        )


def test_only_owner_can_invite(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Shared"}
        ).json()
        alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        )
    with client_as(client, "bob@example.com") as bob:
        # Bob is a scorer, not owner → invite is owner-only.
        response = bob.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "carol@example.com"},
        )
        assert response.status_code == 404


def test_remove_member(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Shared"}
        ).json()
        invite = alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        ).json()
        response = alice.delete(
            f"/v1/workspaces/{ws['id']}/members/{invite['user_id']}"
        )
        assert response.status_code == 204
        members = alice.get(f"/v1/workspaces/{ws['id']}/members").json()
        assert all(m["email"] != "bob@example.com" for m in members)

    # Bob now has no access.
    with client_as(client, "bob@example.com") as bob:
        assert bob.get(f"/v1/workspaces/{ws['id']}").status_code == 404


def test_remove_member_rejects_primary_owner(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Shared"}
        ).json()
        # Owner's user_id == workspace.owner_id; deletion is refused.
        response = alice.delete(
            f"/v1/workspaces/{ws['id']}/members/{ws['owner_id']}"
        )
        assert response.status_code == 400


def test_remove_unknown_member_404(client):
    ws = client.post("/v1/workspaces", json={"name": "Solo"}).json()
    response = client.delete(
        f"/v1/workspaces/{ws['id']}/members/{NIL_UUID}"
    )
    assert response.status_code == 404
