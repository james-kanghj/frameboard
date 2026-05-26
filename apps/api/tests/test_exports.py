# /apps/api/tests/test_exports.py
#
# Notion export tests stub `create_page` so they don't reach out to
# api.notion.com. The endpoint-level behaviour (auth gating,
# success/failure tallying, ownership) is what we're verifying - the
# wire format with Notion is exercised manually + via the production
# smoke test.

from __future__ import annotations

import pytest

from app.api import exports
from app.services import linear_export, notion_export

NIL_UUID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture()
def workspace_with_items(client) -> str:
    ws = client.post(
        "/v1/workspaces", json={"name": "Export WS"}
    ).json()
    client.post(
        f"/v1/workspaces/{ws['id']}/items",
        json={"title": "Alpha", "description": "first"},
    )
    client.post(
        f"/v1/workspaces/{ws['id']}/items",
        json={"title": "Beta", "description": None},
    )
    return ws["id"]


def test_export_requires_notion_configured(client, workspace_with_items):
    response = client.post(
        f"/v1/workspaces/{workspace_with_items}/export/notion"
    )
    assert response.status_code == 400
    assert "Notion integration" in response.json()["detail"]


def test_export_creates_pages(client, workspace_with_items, monkeypatch):
    client.patch(
        "/v1/users/me",
        json={
            "notion_access_token": "secret-token",
            "notion_database_id": "db-abc",
        },
    )

    calls: list[dict] = []

    def fake_create_page(**kwargs):
        calls.append(kwargs)
        return {"id": "fake-page-id"}

    # Patch where the router imported the symbol (not the source
    # module) so the substitution actually takes effect.
    monkeypatch.setattr(exports, "create_page", fake_create_page)

    response = client.post(
        f"/v1/workspaces/{workspace_with_items}/export/notion"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 2
    assert body["failed"] == 0
    assert body["failures"] == []
    assert len(calls) == 2
    assert {c["token"] for c in calls} == {"secret-token"}
    assert {c["database_id"] for c in calls} == {"db-abc"}


def test_export_partial_failure(client, workspace_with_items, monkeypatch):
    client.patch(
        "/v1/users/me",
        json={
            "notion_access_token": "secret-token",
            "notion_database_id": "db-abc",
        },
    )

    def fake_create_page(**kwargs):
        if kwargs["title"] == "Beta":
            raise notion_export.NotionExportError("notion 400: bad shape")
        return {"id": "ok"}

    monkeypatch.setattr(exports, "create_page", fake_create_page)

    response = client.post(
        f"/v1/workspaces/{workspace_with_items}/export/notion"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["failed"] == 1
    assert body["failures"] == [
        {"title": "Beta", "error": "notion 400: bad shape"}
    ]


def test_export_404_on_other_users_workspace(client, client_as):
    with client_as(client, "alice@example.com") as alice:
        ws = alice.post(
            "/v1/workspaces", json={"name": "Alice's"}
        ).json()
    with client_as(client, "mallory@example.com") as mallory:
        mallory.patch(
            "/v1/users/me",
            json={
                "notion_access_token": "secret",
                "notion_database_id": "db",
            },
        )
        response = mallory.post(
            f"/v1/workspaces/{ws['id']}/export/notion"
        )
    assert response.status_code == 404


def test_export_unknown_workspace_404(client):
    client.patch(
        "/v1/users/me",
        json={
            "notion_access_token": "secret",
            "notion_database_id": "db",
        },
    )
    response = client.post(
        f"/v1/workspaces/{NIL_UUID}/export/notion"
    )
    assert response.status_code == 404


# ─── Linear ─────────────────────────────────────────────────────────


def test_linear_export_requires_configured(client, workspace_with_items):
    response = client.post(
        f"/v1/workspaces/{workspace_with_items}/export/linear"
    )
    assert response.status_code == 400
    assert "Linear integration" in response.json()["detail"]


def test_linear_export_creates_issues(
    client, workspace_with_items, monkeypatch
):
    client.patch(
        "/v1/users/me",
        json={
            "linear_api_key": "lin_api_secret",
            "linear_team_id": "team-abc",
        },
    )

    calls: list[dict] = []

    def fake_create_issue(**kwargs):
        calls.append(kwargs)
        return {"id": "issue-id", "identifier": "ENG-1", "url": "https://…"}

    monkeypatch.setattr(exports, "create_issue", fake_create_issue)

    response = client.post(
        f"/v1/workspaces/{workspace_with_items}/export/linear"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 2
    assert body["failed"] == 0
    assert len(calls) == 2
    assert {c["api_key"] for c in calls} == {"lin_api_secret"}
    assert {c["team_id"] for c in calls} == {"team-abc"}


def test_linear_export_partial_failure(
    client, workspace_with_items, monkeypatch
):
    client.patch(
        "/v1/users/me",
        json={
            "linear_api_key": "lin_api_secret",
            "linear_team_id": "team-abc",
        },
    )

    def fake_create_issue(**kwargs):
        if kwargs["title"] == "Beta":
            raise linear_export.LinearExportError("graphql error: nope")
        return {"id": "ok"}

    monkeypatch.setattr(exports, "create_issue", fake_create_issue)

    response = client.post(
        f"/v1/workspaces/{workspace_with_items}/export/linear"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 1
    assert body["failed"] == 1
    assert body["failures"] == [
        {"title": "Beta", "error": "graphql error: nope"}
    ]


def test_users_me_exposes_linear_status(client):
    response = client.get("/v1/users/me")
    body = response.json()
    assert body["linear_configured"] is False
    assert body["linear_team_id"] is None

    client.patch(
        "/v1/users/me",
        json={
            "linear_api_key": "lin_api_xyz",
            "linear_team_id": "team-1",
        },
    )
    body = client.get("/v1/users/me").json()
    assert body["linear_configured"] is True
    assert body["linear_team_id"] == "team-1"
    assert "linear_api_key" not in body
