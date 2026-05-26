# /apps/api/tests/test_collab_scoring.py
#
# Phase B coverage: two members score the same item, the board
# reflects per-user rows + aggregate mean/variance, deleting one
# member's score doesn't disturb the other's.

from __future__ import annotations


def _make_shared_workspace(client, client_as) -> tuple[str, str]:
    """Alice creates a workspace with one item and invites Bob.
    Returns (workspace_id, item_id)."""
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "Team"}).json()
        item = alice.post(
            f"/v1/workspaces/{ws['id']}/items", json={"title": "Score me"}
        ).json()
        alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        )
    return ws["id"], item["id"]


def test_each_member_keeps_their_own_score(client, client_as):
    ws_id, item_id = _make_shared_workspace(client, client_as)

    # Alice scores reach=1000 → score=(1000*1*1)/2=500.
    with client_as(client, "alice@example.com") as alice:
        alice.post(
            "/v1/score/rice",
            json={
                "item_id": item_id,
                "reach": 1000,
                "impact": 1,
                "confidence": 1,
                "effort": 2,
            },
        )
    # Bob scores reach=500 → score=125.
    with client_as(client, "bob@example.com") as bob:
        bob.post(
            "/v1/score/rice",
            json={
                "item_id": item_id,
                "reach": 500,
                "impact": 1,
                "confidence": 1,
                "effort": 2,
            },
        )

    # Alice sees HER own row + aggregate.
    with client_as(client, "alice@example.com") as alice:
        board = alice.get(f"/v1/workspaces/{ws_id}/board").json()
    row = board[0]
    # Alice: (1000*1*1)/2 = 500. Bob: (500*1*1)/2 = 250.
    assert row["rice_score"]["reach"] == 1000
    assert row["rice_score"]["score"] == 500
    assert row["rice_aggregate"]["contributor_count"] == 2
    # Mean of 500 and 250 → 375.
    assert row["rice_aggregate"]["score"] == 375.0
    assert row["rice_aggregate"]["min"] == 250
    assert row["rice_aggregate"]["max"] == 500
    assert row["rice_aggregate"]["variance"] > 0

    # Bob's board shows HIS row but the same aggregate.
    with client_as(client, "bob@example.com") as bob:
        board = bob.get(f"/v1/workspaces/{ws_id}/board").json()
    row = board[0]
    assert row["rice_score"]["reach"] == 500
    assert row["rice_score"]["score"] == 250
    assert row["rice_aggregate"]["score"] == 375.0


def test_delete_my_score_leaves_others_intact(client, client_as):
    ws_id, item_id = _make_shared_workspace(client, client_as)

    with client_as(client, "alice@example.com") as alice:
        alice.post(
            "/v1/score/rice",
            json={
                "item_id": item_id,
                "reach": 1000,
                "impact": 1,
                "confidence": 1,
                "effort": 2,
            },
        )
    with client_as(client, "bob@example.com") as bob:
        bob.post(
            "/v1/score/rice",
            json={
                "item_id": item_id,
                "reach": 500,
                "impact": 1,
                "confidence": 1,
                "effort": 2,
            },
        )

    # Alice clears her score → aggregate now reflects only Bob's row.
    with client_as(client, "alice@example.com") as alice:
        alice.delete(f"/v1/items/{item_id}/rice")
        board = alice.get(f"/v1/workspaces/{ws_id}/board").json()
    row = board[0]
    assert row["rice_score"] is None  # Alice has no row of her own
    assert row["rice_aggregate"]["contributor_count"] == 1
    # Only Bob's 250 remains.
    assert row["rice_aggregate"]["score"] == 250

    # Bob's row + view are unaffected.
    with client_as(client, "bob@example.com") as bob:
        board = bob.get(f"/v1/workspaces/{ws_id}/board").json()
    assert board[0]["rice_score"]["reach"] == 500
    assert board[0]["rice_aggregate"]["score"] == 250


def test_unscored_item_returns_null_aggregate(client, client_as):
    ws_id, item_id = _make_shared_workspace(client, client_as)
    with client_as(client, "alice@example.com") as alice:
        board = alice.get(f"/v1/workspaces/{ws_id}/board").json()
    assert board[0]["rice_score"] is None
    assert board[0]["rice_aggregate"] is None


def test_polymorphic_per_user_score_aggregate(client, client_as):
    """Mirror of the RICE test for the polymorphic frameworks. Uses
    ICE so the score has all three inputs varying per user."""
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Team", "framework": "ICE"}
        ).json()
        item = alice.post(
            f"/v1/workspaces/{ws['id']}/items", json={"title": "Score me"}
        ).json()
        alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        )
        # Alice: I*C*E = 8*8*8 = 512.
        alice.post(
            "/v1/score",
            json={
                "item_id": item["id"],
                "framework": "ICE",
                "inputs": {"impact": 8, "confidence": 8, "ease": 8},
            },
        )
    with client_as(client, "bob@example.com") as bob:
        # Bob: 4*4*4 = 64.
        bob.post(
            "/v1/score",
            json={
                "item_id": item["id"],
                "framework": "ICE",
                "inputs": {"impact": 4, "confidence": 4, "ease": 4},
            },
        )
        board = bob.get(f"/v1/workspaces/{ws['id']}/board").json()
    row = board[0]
    assert row["score"]["score"] == 64
    assert row["score_aggregate"]["contributor_count"] == 2
    # Mean of 512 and 64 = 288.
    assert row["score_aggregate"]["score"] == 288


def test_board_sort_uses_aggregate_not_mine(client, client_as):
    """Item ranking should reflect team consensus (aggregate),
    not whatever the caller personally scored."""
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post("/v1/workspaces", json={"name": "T"}).json()
        a = alice.post(
            f"/v1/workspaces/{ws['id']}/items", json={"title": "A"}
        ).json()
        b = alice.post(
            f"/v1/workspaces/{ws['id']}/items", json={"title": "B"}
        ).json()
        alice.post(
            f"/v1/workspaces/{ws['id']}/members",
            json={"email": "bob@example.com"},
        )
        # Alice scores A=100, B=200 (B higher from her view).
        alice.post(
            "/v1/score/rice",
            json={
                "item_id": a["id"],
                "reach": 100,
                "impact": 1,
                "confidence": 1,
                "effort": 1,
            },
        )
        alice.post(
            "/v1/score/rice",
            json={
                "item_id": b["id"],
                "reach": 200,
                "impact": 1,
                "confidence": 1,
                "effort": 1,
            },
        )
    with client_as(client, "bob@example.com") as bob:
        # Bob scores A=900, B=0 → A's aggregate now (100+900)/2 = 500,
        # B's = (200+0)/2 = 100. Even though Alice ranked B higher, the
        # team consensus says A wins.
        bob.post(
            "/v1/score/rice",
            json={
                "item_id": a["id"],
                "reach": 900,
                "impact": 1,
                "confidence": 1,
                "effort": 1,
            },
        )
        bob.post(
            "/v1/score/rice",
            json={
                "item_id": b["id"],
                "reach": 0,
                "impact": 1,
                "confidence": 1,
                "effort": 1,
            },
        )
        board = bob.get(f"/v1/workspaces/{ws['id']}/board").json()
        assert [r["title"] for r in board] == ["A", "B"]
